import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, loginUser, getSession, logoutUser } from "./authService";
import { supabase } from "./supabaseClient";
import authHomme from "./assets/auth-homme.webp";

const s = (str) => String(str ?? "").replace(/[<>"'`]/g, "").slice(0, 300);
const sPhone = (p) => String(p).replace(/[^\d+\s]/g, "").slice(0, 16);
const sPin = (p) => String(p).replace(/\D/g, "").slice(0, 4);
const fmtFCFA = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";
const genId = () => Date.now() + Math.random().toString(36).slice(2, 7);

const I18N={
  fr:{
    connexion:"Connexion",inscription:"Inscription",bienvenue:"Bienvenue",
    accueil:"Accueil",epargne:"Epargne",profil:"Profil",
    mesTontines:"Mes Tontines",creer:"Creer",ajouter:"Ajouter",modifier:"Modifier",supprimer:"Supprimer",
    enregistrer:"Enregistrer",annuler:"Annuler",gratuit:"GRATUIT",premium:"PREMIUM",
    notifications:"Activer les notifications",lierWA:"Lier WhatsApp",changerPin:"Changer mon PIN",
    exporterDonnees:"Exporter mes donnees",contacterSupport:"Contacter le support",deconnexion:"Deconnexion",
    panneauAdmin:"Panneau Administrateur",langue:"Langue",
    mesEpargnes:"Mes epargnes",caisseSociale:"Caisse sociale",
    membresEnRetard:"membre(s) en retard",cliquezTontine:"Cliquez sur une tontine",
  },
  en:{
    connexion:"Log in",inscription:"Sign up",bienvenue:"Welcome",
    accueil:"Home",epargne:"Savings",profil:"Profile",
    mesTontines:"My Tontines",creer:"Create",ajouter:"Add",modifier:"Edit",supprimer:"Delete",
    enregistrer:"Save",annuler:"Cancel",gratuit:"FREE",premium:"PREMIUM",
    notifications:"Enable notifications",lierWA:"Link WhatsApp",changerPin:"Change my PIN",
    exporterDonnees:"Export my data",contacterSupport:"Contact support",deconnexion:"Log out",
    panneauAdmin:"Admin Panel",langue:"Language",
    mesEpargnes:"My savings",caisseSociale:"Social fund",
    membresEnRetard:"member(s) late",cliquezTontine:"Click on a tontine",
  },
  ar:{
    connexion:"تسجيل الدخول",inscription:"إنشاء حساب",bienvenue:"مرحبا",
    accueil:"الرئيسية",epargne:"الادخار",profil:"الملف الشخصي",
    mesTontines:"جمعياتي",creer:"إنشاء",ajouter:"إضافة",modifier:"تعديل",supprimer:"حذف",
    enregistrer:"حفظ",annuler:"إلغاء",gratuit:"مجاني",premium:"بريميوم",
    notifications:"تفعيل الإشعارات",lierWA:"ربط واتساب",changerPin:"تغيير الرمز السري",
    exporterDonnees:"تصدير بياناتي",contacterSupport:"الاتصال بالدعم",deconnexion:"تسجيل الخروج",
    panneauAdmin:"لوحة الإدارة",langue:"اللغة",
    mesEpargnes:"مدخراتي",caisseSociale:"الصندوق الاجتماعي",
    membresEnRetard:"عضو(ة) متأخر(ة)",cliquezTontine:"اضغطي على جمعية",
  },
};
let CURRENT_LANG="fr";
const setAppLang=(l)=>{CURRENT_LANG=I18N[l]?l:"fr";document.documentElement.dir=CURRENT_LANG==="ar"?"rtl":"ltr";document.documentElement.lang=CURRENT_LANG;};
const t=(key)=>I18N[CURRENT_LANG]?.[key]||I18N.fr[key]||key;

const SpeechRec = typeof window!=="undefined" ? (window.SpeechRecognition||window.webkitSpeechRecognition) : null;
function useVoiceInput(onResult,onToast){
  const recRef=useRef(null);
  const [listening,setListening]=useState(false);
  const toggle=()=>{
    if(!SpeechRec){onToast&&onToast("Dictee vocale non disponible sur ce navigateur","error");return;}
    if(listening){recRef.current?.stop();setListening(false);return;}
    const rec=new SpeechRec();
    rec.lang="fr-FR";rec.interimResults=false;rec.maxAlternatives=1;
    rec.onresult=(e)=>{const t=e.results[0][0].transcript;onResult(t);};
    rec.onend=()=>setListening(false);
    rec.onerror=()=>{setListening(false);onToast&&onToast("Erreur de reconnaissance vocale","error");};
    recRef.current=rec;rec.start();setListening(true);
  };
  return {listening,toggle};
}



const Avatar = ({ prenom, photo, size=40, gold=false }) => {
  const [err, setErr] = useState(false);
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:gold?"linear-gradient(135deg,#D4A843,#B8922E)":"linear-gradient(135deg,#1B4332,#2D6A4F)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",border:gold?"2px solid #D4A843":"none"}}>
      {photo&&!err?<img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setErr(true)}/>:<span style={{color:gold?"#0A1A0F":"#D4A843",fontWeight:900,fontSize:size*0.38}}>{(prenom||"?")[0].toUpperCase()}</span>}
    </div>
  );
};

const Badge = ({score}) => {
  const c = score>=90?{bg:"#D4A843",t:"Or",fg:"#0A1A0F"}:score>=70?{bg:"#1B6B45",t:"Bien",fg:"#FDF6EC"}:{bg:"#C1440E",t:"Retard",fg:"#FDF6EC"};
  return <span style={{background:c.bg,color:c.fg,borderRadius:99,padding:"2px 8px",fontSize:11,fontWeight:700}}>{c.t}</span>;
};

const Bar = ({pct,c}) => (
  <div style={{background:"#1B4332",borderRadius:99,height:6,overflow:"hidden",marginTop:10}}>
    <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:c,borderRadius:99,transition:"width .5s"}}/>
  </div>
);

const Toast = ({msg,type="success",onClose}) => {
  useEffect(()=>{const t=setTimeout(onClose,3200);return()=>clearTimeout(t);},[]);
  const bg=type==="error"?"#C1440E":type==="warn"?"#B8922E":"#1B6B45";
  return <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",background:bg,color:"#FDF6EC",padding:"12px 22px",borderRadius:14,fontWeight:700,zIndex:9999,fontSize:14,boxShadow:"0 8px 30px rgba(0,0,0,0.5)",maxWidth:340,textAlign:"center"}}>{msg}</div>;
};

const Modal = ({children,onClose}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
    <div style={{background:"#0F2419",borderRadius:"24px 24px 0 0",padding:"20px 20px 44px",width:"100%",maxWidth:440,border:"1px solid #1B4332",borderBottom:"none",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>{children}</div>
  </div>
);

const MH = ({title,onClose}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
    <h3 style={{color:"#FDF6EC",margin:0,fontSize:18,fontWeight:800}}>{title}</h3>
    <button onClick={onClose} style={{background:"none",border:"none",color:"#6B7280",fontSize:22,cursor:"pointer"}}>x</button>
  </div>
);

const Fld = ({label,children}) => (
  <div style={{marginBottom:16}}>
    <label style={{display:"block",color:"#6B7280",fontSize:11,marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{label}</label>
    {children}
  </div>
);

const Inp = ({value,onChange,placeholder,type="text",inputMode,maxLength,autoFocus,onKeyDown}) => (
  <input value={value} onChange={onChange} placeholder={placeholder} type={type} inputMode={inputMode} maxLength={maxLength} autoFocus={autoFocus} onKeyDown={onKeyDown}
    style={{width:"100%",background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:12,padding:"13px 14px",color:"#FDF6EC",fontSize:15,outline:"none"}}/>
);

const Btn = ({onClick,children,disabled}) => (
  <button onClick={onClick} disabled={disabled}
    style={{width:"100%",background:disabled?"#1B4332":"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:14,padding:"14px",color:disabled?"#6B7280":"#0A1A0F",fontWeight:800,fontSize:15,cursor:disabled?"not-allowed":"pointer",marginTop:6}}>
    {children}
  </button>
);

const ErrBox = ({msg}) => msg?<p style={{color:"#EF4444",fontSize:13,margin:"0 0 12px",fontWeight:600,background:"#1A0800",padding:"8px 12px",borderRadius:8}}>{msg}</p>:null;

const AuthScreen = ({onLogin}) => {
  const [step,setStep]=useState("welcome");
  const [prenom,setPrenom]=useState("");
  const [tel,setTel]=useState("");
  const [pin,setPin]=useState("");
  const [pinC,setPinC]=useState("");
  const [photo,setPhoto]=useState(null);
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const fileRef=useRef();

  const handlePhoto=(e)=>{const f=e.target.files?.[0];if(!f)return;if(f.size>4*1024*1024)return setErr("Photo max 4MB");const r=new FileReader();r.onload=(ev)=>setPhoto(ev.target.result);r.readAsDataURL(f);};
  const go=(st)=>{setStep(st);setErr("");setPin("");setPinC("");};

  const doLogin=async()=>{
    setErr("");
    if(tel.replace(/\D/g,"").length<8)return setErr("Numero invalide");
    if(pin.length!==4)return setErr("Le PIN doit faire 4 chiffres");
    setLoading(true);
    const res=await loginUser(tel,pin);
    setLoading(false);
    if(!res.ok)return setErr(res.err);
    onLogin(res.user);
  };

  const doRegister=async()=>{
    setErr("");
    if(!prenom.trim()||prenom.trim().length<2)return setErr("Prenom trop court");
    if(tel.replace(/\D/g,"").length<8)return setErr("Numero invalide");
    if(pin.length!==4)return setErr("Le PIN doit faire 4 chiffres");
    if(pin!==pinC)return setErr("Les deux PIN ne correspondent pas");
    setLoading(true);
    const res=await registerUser(tel,pin,s(prenom.trim()),photo);
    setLoading(false);
    if(!res.ok)return setErr(res.err);
    onLogin(res.user);
  };

  const W={minHeight:"100vh",background:"linear-gradient(160deg,#050F07,#1B4332)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"};
  const C={background:"#0F2419",borderRadius:24,padding:"28px 24px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"};

  if(step==="welcome") return(
    <div style={W}><div style={C}>
      <div style={{textAlign:"center",paddingBottom:8}}>
        <div style={{width:120,height:120,borderRadius:"50%",margin:"0 auto 18px",padding:4,background:"linear-gradient(135deg,#D4A843,#E8B96A)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <img src={authHomme} alt="HABY Tontine" style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover",border:"3px solid #0A1A0F"}}/>
        </div>
        <h1 style={{color:"#FDF6EC",fontSize:30,fontWeight:900,margin:"8px 0 4px",letterSpacing:2}}>HABY Tontine</h1>
        <p style={{color:"#6B7280",fontSize:13,margin:0}}>Ta tontine. Digitale. Securisee.</p>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:40}}>
        <Btn onClick={()=>go("register")}>Creer mon compte gratuit</Btn>
        <button onClick={()=>go("login")} style={{width:"100%",background:"transparent",border:"2px solid #1B4332",borderRadius:14,padding:"13px",color:"#FDF6EC",fontWeight:700,fontSize:15,cursor:"pointer"}}>Jai deja un compte</button>
      </div>
      <p style={{color:"#2D6A4F",fontSize:11,textAlign:"center",marginTop:20}}>Sans email - Donnees chiffrees - 100% prive</p>
    </div></div>
  );

  if(step==="login") return(
    <div style={W}><div style={C}>
      <button onClick={()=>go("welcome")} style={{background:"none",border:"none",color:"#D4A843",cursor:"pointer",fontSize:14,padding:"0 0 16px",display:"block",fontWeight:600}}>← Retour</button>
      <h2 style={{color:"#FDF6EC",fontWeight:800,fontSize:22,margin:"0 0 20px"}}>Connexion</h2>
      <Fld label="Numero de telephone"><Inp value={tel} onChange={e=>setTel(sPhone(e.target.value))} placeholder="+223 76 XX XX XX" type="tel" maxLength={16} autoFocus/></Fld>
      <Fld label="Code PIN (4 chiffres)"><Inp value={pin} onChange={e=>setPin(sPin(e.target.value))} placeholder="Code secret" type="password" inputMode="numeric" maxLength={4}/></Fld>
      <ErrBox msg={err}/>
      <Btn onClick={doLogin} disabled={loading}>{loading?"Verification...":"Se connecter"}</Btn>
      <p style={{color:"#6B7280",fontSize:12,textAlign:"center",marginTop:16,cursor:"pointer"}} onClick={()=>go("register")}>Pas encore inscrit ? <span style={{color:"#D4A843",fontWeight:700}}>Creer un compte</span></p>
    </div></div>
  );

  return(
    <div style={{...W,alignItems:"flex-start"}}><div style={{...C,margin:"20px auto"}}>
      <button onClick={()=>go("welcome")} style={{background:"none",border:"none",color:"#D4A843",cursor:"pointer",fontSize:14,padding:"0 0 16px",display:"block",fontWeight:600}}>← Retour</button>
      <h2 style={{color:"#FDF6EC",fontWeight:800,fontSize:22,margin:"0 0 20px"}}>Creer mon compte</h2>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:20}}>
        <div onClick={()=>fileRef.current?.click()} style={{cursor:"pointer",position:"relative"}}>
          <Avatar prenom={prenom||"?"} photo={photo} size={76} gold/>
          <div style={{position:"absolute",bottom:0,right:0,background:"#D4A843",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:"#0A1A0F"}}>+</div>
        </div>
        <p style={{color:"#6B7280",fontSize:11,margin:"8px 0 0"}}>Photo de profil (optionnel)</p>
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
      </div>
      <Fld label="Prenom"><Inp value={prenom} onChange={e=>setPrenom(s(e.target.value))} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
      <Fld label="Numero de telephone"><Inp value={tel} onChange={e=>setTel(sPhone(e.target.value))} placeholder="+223 76 XX XX XX" type="tel" maxLength={16}/></Fld>
      <Fld label="Code PIN secret (4 chiffres)"><Inp value={pin} onChange={e=>setPin(sPin(e.target.value))} placeholder="Code secret" type="password" inputMode="numeric" maxLength={4}/></Fld>
      <Fld label="Confirmer le PIN"><Inp value={pinC} onChange={e=>setPinC(sPin(e.target.value))} placeholder="Confirmer" type="password" inputMode="numeric" maxLength={4}/></Fld>
      <ErrBox msg={err}/>
      <Btn onClick={doRegister} disabled={loading}>{loading?"Creation...":"Creer mon compte"}</Btn>
      <p style={{color:"#2D6A4F",fontSize:11,textAlign:"center",marginTop:14}}>Ton PIN est chiffre et jamais partage</p>
    </div></div>
  );
};

const MembreRow = ({m,onToggle,onWA,montant,onVersement,onHistorique,onDelete,onPhoto}) => (
  <div style={{background:"#0F2419",border:`1px solid ${m.paye?"#1B4332":"#C1440E44"}`,borderRadius:14,padding:"12px 14px",marginBottom:8}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <Avatar prenom={m.prenom} photo={m.photo} size={46}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2,flexWrap:"wrap"}}>
          <p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{m.prenom}</p>
          <Badge score={m.score}/>
          {!m.paye&&<span style={{background:"#C1440E",color:"#fff",fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99}}>NON PAYE</span>}
        </div>
        {m.quartier&&<p style={{margin:0,color:"#D4A843",fontSize:11,fontWeight:600}}>📍 {m.quartier}</p>}
        <p style={{margin:"1px 0 0",color:"#6B7280",fontSize:11}}>{m.tel}</p>
      </div>
      <div onClick={onToggle} style={{width:30,height:30,borderRadius:"50%",background:m.paye?"#22C55E":"#EF4444",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,color:"#fff",fontWeight:900}}>{m.paye?"v":"x"}</div>
    </div>
    <div style={{margin:"8px 0",padding:"9px 10px",background:"#0A1A0F",borderRadius:8}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{color:"#6B7280",fontSize:12}}>Cotisations payees</span>
        <span style={{color:"#D4A843",fontWeight:700,fontSize:12}}>{fmtFCFA((m.cyclesPaies||0)*(montant||0))}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{color:"#6B7280",fontSize:12}}>Versements recus</span>
        <span style={{color:"#22C55E",fontWeight:700,fontSize:12}}>{fmtFCFA(m.versements||0)}</span>
      </div>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      <button onClick={onWA} style={{flex:1,background:"#075E54",border:"none",borderRadius:10,padding:"8px",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",minWidth:70}}>WhatsApp</button>
      <button onClick={()=>onVersement(m)} style={{flex:1,background:"#1A2E1F",border:"1px solid #D4A843",borderRadius:10,padding:"8px",color:"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer",minWidth:70}}>+ Versement</button>
      <button onClick={()=>onHistorique(m)} style={{flex:1,background:"#1A2E1F",border:"1px solid #6B7280",borderRadius:10,padding:"8px",color:"#FDF6EC",fontSize:11,fontWeight:700,cursor:"pointer",minWidth:70}}>Historique</button>
      <label style={{background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 10px",color:"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center"}}>📷<input type="file" accept="image/*" hidden onChange={e=>onPhoto(m.id,e)}/></label>
      <button onClick={()=>onDelete(m.id)} style={{background:"transparent",border:"1px solid #C1440E",borderRadius:10,padding:"8px 10px",color:"#EF4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>Retirer</button>
    </div>
    {!m.paye&&<button onClick={onToggle} style={{width:"100%",background:"#1B4332",border:"1px solid #22C55E",borderRadius:10,padding:"8px",color:"#22C55E",fontSize:12,fontWeight:700,cursor:"pointer",marginTop:6}}>Marquer paye ce cycle</button>}
  </div>
);

const HomeScreen = ({user,groupes,onSelectGroupe,onCreer,onProfil,participations,onSelectParticipation}) => {
  const totalEp=groupes.reduce((a,g)=>a+g.cagnotte,0);
  const totalCS=groupes.reduce((a,g)=>a+g.caisseSociale,0);
  const nbRet=groupes.reduce((a,g)=>a+g.membres.filter(m=>!m.paye).length,0);
  return(
    <div style={{paddingBottom:16}}>
      <div style={{background:"linear-gradient(135deg,#0F2419,#1B4332)",padding:"48px 20px 36px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <p style={{color:"#D4A843",fontSize:13,margin:0,fontWeight:600}}>{t("bienvenue")}</p>
          <h2 style={{color:"#FDF6EC",margin:"2px 0 0",fontSize:24,fontWeight:900}}>{user.prenom}</h2>
          <span style={{background:user.plan==="premium"?"#D4A843":"#1B4332",color:user.plan==="premium"?"#0A1A0F":"#D4A843",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,marginTop:4,display:"inline-block"}}>
            {user.plan==="premium"?"PREMIUM":`GRATUIT - ${groupes.length}/3 tontines`}
          </span>
        </div>
        <div onClick={onProfil} style={{cursor:"pointer"}}><Avatar prenom={user.prenom} photo={user.photo} size={50} gold/></div>
      </div>
      <div style={{display:"flex",gap:10,padding:"0 16px",marginTop:-22}}>
        {[["💰",t("mesEpargnes"),totalEp,"linear-gradient(135deg,#1B4332,#2D6A4F)"],["🏦",t("caisseSociale"),totalCS,"linear-gradient(135deg,#8B2500,#C1440E)"]].map(([ic,lb,val,bg])=>(
          <div key={lb} style={{flex:1,background:bg,borderRadius:16,padding:"14px 12px"}}>
            <span style={{fontSize:20}}>{ic}</span>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,margin:"6px 0 2px",fontWeight:600}}>{lb}</p>
            <p style={{color:"#FDF6EC",fontSize:15,fontWeight:900,margin:0}}>{fmtFCFA(val)}</p>
          </div>
        ))}
      </div>
      {nbRet>0&&<div style={{margin:"14px 16px 0",background:"#1A0800",border:"1px solid #C1440E",borderRadius:14,padding:"12px 16px",display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:20}}>⚠️</span><div><p style={{margin:0,color:"#EF4444",fontWeight:700,fontSize:13}}>{nbRet} {t("membresEnRetard")}</p><p style={{margin:0,color:"#6B7280",fontSize:12}}>{t("cliquezTontine")}</p></div></div>}
      <div style={{padding:"20px 16px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{color:"#FDF6EC",fontSize:16,fontWeight:800,margin:0}}>{t("mesTontines")}</h3>
          <button onClick={onCreer} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 16px",color:"#D4A843",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ {t("creer")}</button>
        </div>
        {groupes.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:"#2D6A4F"}}><p style={{fontSize:40}}>🏺</p><p style={{fontWeight:700,color:"#FDF6EC"}}>Aucune tontine</p><p style={{fontSize:13}}>Cree ta premiere tontine</p></div>}
        {groupes.map(g=>{
          const pct=Math.round((g.cycle/g.totalCycles)*100);
          const ret=g.membres.filter(m=>!m.paye).length;
          return(
            <div key={g.id} style={{background:"#0F2419",borderRadius:16,padding:16,marginBottom:10,border:"1px solid #1B4332",cursor:"pointer"}} onClick={()=>onSelectGroupe(g)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:12,height:12,borderRadius:"50%",background:g.couleur,flexShrink:0}}/><div><p style={{margin:0,color:"#FDF6EC",fontWeight:800,fontSize:15}}>{g.nom}</p><p style={{margin:"2px 0 0",color:"#6B7280",fontSize:12}}>{g.membres.length} membres - {g.frequence}</p></div></div>
                <div style={{textAlign:"right"}}><p style={{margin:0,color:"#D4A843",fontWeight:800,fontSize:15}}>{fmtFCFA(g.montant)}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>par cotisation</p></div>
              </div>
              <Bar pct={pct} c={g.couleur}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                <p style={{margin:0,color:"#6B7280",fontSize:11}}>Cycle {g.cycle}/{g.totalCycles} - Tour: <strong style={{color:"#FDF6EC"}}>{g.prochainTour}</strong></p>
                {ret>0&&<span style={{background:"#C1440E",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99}}>{ret} retard(s)</span>}
              </div>
            </div>
          );
        })}
      </div>
      {groupes.length>0&&<div style={{margin:"16px 16px 0",background:"#0A1A0F",border:"1px solid #D4A843",borderRadius:14,padding:"12px 16px",display:"flex",gap:12,alignItems:"center"}}><span style={{fontSize:22,color:"#D4A843"}}>🔔</span><div><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:13}}>Rappel cotisation</p><p style={{margin:0,color:"#6B7280",fontSize:12}}>Dans 3 jours - Tontine des Mamans</p></div></div>}
      {participations&&participations.length>0&&<div style={{padding:"22px 16px 0"}}>
        <h3 style={{color:"#FDF6EC",fontSize:16,fontWeight:800,margin:"0 0 14px"}}>Tontines ou je participe</h3>
        {participations.map(g=>(
          <div key={g.id} onClick={()=>onSelectParticipation(g)} style={{background:"#0F2419",borderRadius:16,padding:16,marginBottom:10,border:"1px solid #2D6A4F",cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:12,height:12,borderRadius:"50%",background:g.couleur,flexShrink:0}}/><div><p style={{margin:0,color:"#FDF6EC",fontWeight:800,fontSize:15}}>{g.nom}</p><p style={{margin:"2px 0 0",color:"#6B7280",fontSize:12}}>{g.membres.length} membres - {g.frequence}</p></div></div>
              <span style={{background:g.moi?.paye?"#22C55E":"#C1440E",color:"#fff",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{g.moi?.paye?"A jour":"En retard"}</span>
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
};

const ParticipationScreen = ({groupe,onBack}) => {
  const pct=Math.round((groupe.cycle/groupe.totalCycles)*100);
  return(
    <div style={{paddingBottom:16}}>
      <div style={{padding:"44px 16px 0",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#D4A843",fontSize:22,cursor:"pointer"}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#FDF6EC",margin:0,fontSize:17,fontWeight:800}}>{groupe.nom}</h2><p style={{color:"#D4A843",margin:0,fontSize:12}}>{groupe.frequence} - {fmtFCFA(groupe.montant)}/cotisation</p></div>
        <span style={{background:"#1B4332",color:"#6B7280",fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:99}}>Lecture seule</span>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <Bar pct={pct} c={groupe.couleur}/>
        <p style={{color:"#6B7280",fontSize:12,margin:"6px 0 0"}}>Cycle {groupe.cycle}/{groupe.totalCycles}</p>
      </div>
      {groupe.moi&&<div style={{margin:"16px 16px 0",background:"#0F2419",border:"1px solid #D4A843",borderRadius:14,padding:16}}>
        <p style={{margin:0,color:"#D4A843",fontWeight:700,fontSize:13}}>Ma situation</p>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
          <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Statut</p><p style={{margin:"2px 0 0",color:groupe.moi.paye?"#22C55E":"#EF4444",fontWeight:800,fontSize:14}}>{groupe.moi.paye?"A jour":"En retard"}</p></div>
          <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Verse au total</p><p style={{margin:"2px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:14}}>{fmtFCFA(groupe.moi.versements)}</p></div>
          <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Cycles payes</p><p style={{margin:"2px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:14}}>{groupe.moi.cyclesPaies}/{groupe.totalCycles}</p></div>
        </div>
      </div>}
      <div style={{padding:"20px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>MEMBRES DU GROUPE</p>
        {groupe.membres.map(m=>(
          <div key={m.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
            <Avatar prenom={m.prenom} photo={m.photo} size={38}/>
            <p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14,flex:1}}>{m.prenom}</p>
            <span style={{background:m.paye?"#1B4332":"#1A0800",color:m.paye?"#22C55E":"#EF4444",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{m.paye?"Paye":"En retard"}</span>
          </div>
        ))}
      </div>
      <div style={{margin:"16px 16px 0",background:"#0A1A0F",border:"1px solid #2D6A4F",borderRadius:12,padding:12}}>
        <p style={{margin:0,color:"#6B7280",fontSize:11,lineHeight:1.6}}>ℹ️ Tu es membre de cette tontine, pas administratrice. Seule la personne qui l a creee peut la modifier. Pour signaler un paiement, contacte-la directement.</p>
      </div>
    </div>
  );
};

const GroupeScreen = ({groupe:gInit,onBack,onToast,user,onDeleteGroupe,onUpdateGroupe}) => {
  const [groupe,setGroupe]=useState(gInit);
  const [tab,setTab]=useState("membres");
  const [msgInput,setMsgInput]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [newM,setNewM]=useState({prenom:"",tel:"",quartier:"",photo:""});
  const [pickerBusy,setPickerBusy]=useState(false);
  const [showVers,setShowVers]=useState(false);
  const [versM,setVersM]=useState(null);
  const [versAmt,setVersAmt]=useState("");
  const [showHisto,setShowHisto]=useState(false);
  const [histoM,setHistoM]=useState(null);
  const [newTask,setNewTask]=useState("");
  const [evtM,setEvtM]=useState(null);
  const [evtTxt,setEvtTxt]=useState("");
  const [showEdit,setShowEdit]=useState(false);
  const [editG,setEditG]=useState({nom:gInit.nom,montant:String(gInit.montant),frequence:gInit.frequence});
  const [editBusy,setEditBusy]=useState(false);

  const deleteGroupe=async()=>{
    if(!confirm("Supprimer cette tontine et tous ses membres ? Cette action est irreversible."))return;
    const {error}=await supabase.from("groupes").delete().eq("id",groupe.id);
    if(error)return onToast("Suppression impossible","error");
    onDeleteGroupe(groupe.id);
    onToast("Tontine supprimee");
  };
  const saveEdit=async()=>{
    if(!editG.nom.trim())return onToast("Le nom est requis","error");
    if(!editG.montant||Number(editG.montant)<500)return onToast("Montant minimum 500 FCFA","error");
    setEditBusy(true);
    const {error}=await supabase.from("groupes").update({nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence}).eq("id",groupe.id);
    setEditBusy(false);
    if(error)return onToast("Modification impossible","error");
    setGroupe(g=>({...g,nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence}));
    onUpdateGroupe(groupe.id,{nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence});
    setShowEdit(false);onToast("Tontine modifiee !");
  };

  const aJour=groupe.membres.filter(m=>m.paye);
  const enRet=groupe.membres.filter(m=>!m.paye);
  const collecte=aJour.length*groupe.montant;
  const cagnotteTour=groupe.membres.length*groupe.montant;
  const taux=groupe.membres.length>0?Math.round((aJour.length/groupe.membres.length)*100):0;

  const toggleP=async(mid)=>{
    const m=groupe.membres.find(x=>x.id===mid);
    const newPaye=!m.paye;
    const newScore=newPaye?Math.min(m.score+5,100):Math.max(m.score-10,0);
    const {error}=await supabase.from("membres").update({paye:newPaye,score:newScore}).eq("id",mid);
    if(error)return onToast("Mise a jour impossible","error");
    if(newPaye){
      await supabase.from("transactions").insert({groupe_id:groupe.id,membre_id:mid,montant:groupe.montant,cycle:groupe.cycle,statut:"paye"});
    }
    setGroupe(g=>({...g,membres:g.membres.map(x=>x.id===mid?{...x,paye:newPaye,score:newScore}:x)}));
    onToast("Statut mis a jour");
  };
  const toggleC=async(cid)=>{
    const c=groupe.checklist.find(x=>x.id===cid);
    const {error}=await supabase.from("checklist").update({done:!c.done}).eq("id",cid);
    if(error)return onToast("Mise a jour impossible","error");
    setGroupe(g=>({...g,checklist:g.checklist.map(c=>c.id===cid?{...c,done:!c.done}:c)}));
  };
  const addTask=async()=>{
    if(!newTask.trim())return onToast("Ecris une tache d abord","error");
    const {data,error}=await supabase.from("checklist").insert({groupe_id:groupe.id,label:s(newTask.trim()),done:false}).select().single();
    if(error)return onToast("Ajout impossible","error");
    setGroupe(g=>({...g,checklist:[...g.checklist,{id:data.id,label:data.label,done:false}]}));
    setNewTask("");onToast("Tache ajoutee !");
  };
  const delTask=async(cid)=>{
    const {error}=await supabase.from("checklist").delete().eq("id",cid);
    if(error)return onToast("Suppression impossible","error");
    setGroupe(g=>({...g,checklist:g.checklist.filter(c=>c.id!==cid)}));
    onToast("Tache supprimee");
  };
  const openEvt=(m)=>{setEvtM(m);setEvtTxt(m.evenement||"");};
  const saveEvt=async()=>{
    const val=evtTxt.trim()?s(evtTxt.trim()):null;
    const {error}=await supabase.from("membres").update({evenement:val}).eq("id",evtM.id);
    if(error)return onToast("Mise a jour impossible","error");
    setGroupe(g=>({...g,membres:g.membres.map(m=>m.id===evtM.id?{...m,evenement:val}:m)}));
    setEvtM(null);setEvtTxt("");onToast(val?"Evenement enregistre !":"Evenement supprime");
  };
  const sendMsg=()=>{if(!msgInput.trim())return;setGroupe(g=>({...g,messages:[...g.messages,{id:genId(),auteur:user.prenom,texte:s(msgInput.trim()),time:"maintenant"}]}));setMsgInput("");};
  const addM=async()=>{
    if(pickerBusy)return;
    if(!newM.prenom.trim()||newM.tel.replace(/\D/g,"").length<8)return onToast("Prenom et telephone requis","error");
    setPickerBusy(true);
    const payload={groupe_id:groupe.id,prenom:s(newM.prenom.trim()),tel:sPhone(newM.tel),quartier:s(newM.quartier||""),photo_url:newM.photo||null,paye:false,score:80,versements:0,cycles_paies:0,ordre:groupe.membres.length};
    const {data,error}=await supabase.from("membres").insert(payload).select().single();
    setPickerBusy(false);
    if(error)return onToast("Ajout impossible","error");
    supabase.rpc("link_membre",{p_membre_id:data.id}).catch(()=>{});
    setGroupe(g=>({...g,membres:[...g.membres,{id:data.id,prenom:data.prenom,tel:data.tel,quartier:data.quartier,photo:data.photo_url,score:80,paye:false,cyclesPaies:0,cyclesTotal:g.totalCycles-g.cycle+1,evenement:null,versements:0}]}));
    setNewM({prenom:"",tel:"",quartier:"",photo:""});setShowAdd(false);onToast("Membre ajoute !");
  };
  const delM=async(mid)=>{
    const {error}=await supabase.from("membres").delete().eq("id",mid);
    if(error)return onToast("Suppression impossible","error");
    setGroupe(g=>({...g,membres:g.membres.filter(m=>m.id!==mid)}));
    onToast("Membre retire");
  };
  const openVers=(m)=>{setVersM(m);setVersAmt("");setShowVers(true);};
  const openHisto=async(m)=>{
    setHistoM({...m,historique:[]});setShowHisto(true);
    const {data,error}=await supabase.from("transactions").select("*").eq("membre_id",m.id).order("created_at",{ascending:false});
    if(!error)setHistoM(h=>h&&h.id===m.id?{...h,historique:(data||[]).map(t=>({mois:new Date(t.created_at).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}),montant:Number(t.montant),statut:t.statut,date:t.created_at?.split("T")[0]}))}:h);
  };
  const updatePhoto=(mid,e)=>{
    const f=e.target.files?.[0];if(!f)return;
    if(f.size>4*1024*1024)return onToast("Photo max 4 Mo","error");
    const r=new FileReader();
    r.onload=async(ev)=>{
      const photoUrl=ev.target.result;
      const {error}=await supabase.from("membres").update({photo_url:photoUrl}).eq("id",mid);
      if(error)return onToast("Photo impossible a sauvegarder","error");
      setGroupe(g=>({...g,membres:g.membres.map(m=>m.id===mid?{...m,photo:photoUrl}:m)}));
      onToast("Photo mise a jour !");
    };
    r.readAsDataURL(f);
  };

  const buildRecu=(m,amt,paye)=>{
    const now=new Date();
    const dateStr=now.toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"});
    const heureStr=now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
    return `HABY TONTINE - RECU DE PAIEMENT OFFICIEL
================================
Date : ${dateStr} a ${heureStr}
Ref  : HABY-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${m.id.slice(-4).toUpperCase()}

MEMBRE     : ${m.prenom}
TONTINE    : ${groupe.nom}
FREQUENCE  : ${groupe.frequence}
MONTANT DU : ${fmtFCFA(groupe.montant)}
================================
MONTANT RECU    : ${fmtFCFA(amt)}
TOTAL VERSE     : ${fmtFCFA((m.versements||0)+amt)}
STATUT          : ${paye?"PAYE CE CYCLE":"VERSEMENT PARTIEL"}
================================
Cycle en cours : ${groupe.cycle} sur ${groupe.totalCycles}
Fiabilite      : ${m.score}% -> ${Math.min(m.score+(paye?5:2),100)}%

Merci ${m.prenom} pour votre confiance !
HABY Tontine - La tontine digitale africaine`;
  };

  const saveVers=async(sendWA)=>{
    const amt=Number(versAmt);
    if(!amt||amt<1)return;
    const newVersements=(versM.versements||0)+amt;
    const paye=newVersements>=groupe.montant;
    const recu=buildRecu(versM,amt,paye);
    const newScore=Math.min(versM.score+(paye?5:2),100);
    const newCyclesPaies=paye?versM.cyclesPaies+1:versM.cyclesPaies;
    const {error:mErr}=await supabase.from("membres").update({versements:newVersements,paye,score:newScore,cycles_paies:newCyclesPaies}).eq("id",versM.id);
    if(mErr)return onToast("Versement impossible","error");
    await supabase.from("transactions").insert({groupe_id:groupe.id,membre_id:versM.id,montant:amt,cycle:groupe.cycle,statut:paye?"paye":"partiel"});
    setGroupe(g=>({...g,
      cagnotte:g.cagnotte+amt,
      membres:g.membres.map(m=>m.id===versM.id?{...m,versements:newVersements,paye,cyclesPaies:newCyclesPaies,score:newScore}:m)
    }));
    if(sendWA){
      const tel=versM.tel.replace(/[\s+]/g,"");
      window.open("https://wa.me/"+tel+"?text="+encodeURIComponent(recu),"_blank");
    }
    setShowVers(false);setVersM(null);setVersAmt("");
    onToast(sendWA?"Versement enregistre + recu WhatsApp envoye !":"Versement enregistre !");
  };

  const sendRappelEcheance=()=>{
    const retardeurs=groupe.membres.filter(m=>!m.paye);
    if(retardeurs.length===0)return onToast("Tous les membres ont paye !");
    retardeurs.forEach(m=>{
      const msg=`Bonjour ${m.prenom},\n\nRappel HABY Tontine - ${groupe.nom}\nDate d echeance : ${groupe.dateEcheance||"a venir"}\nMontant a payer : ${fmtFCFA(groupe.montant)}\n\nMerci de regler avant la date limite.\n\nHABY Tontine - Votre tontine digitale`;
      const tel=m.tel.replace(/[\s+]/g,"");
      window.open("https://wa.me/"+tel+"?text="+encodeURIComponent(msg),"_blank");
    });
    onToast("Rappels envoyes a "+retardeurs.length+" membre(s) en retard");
  };
  const sendWA=(m)=>{const msg=encodeURIComponent(`Bonjour ${m.prenom}\n\nRappel tontine "${groupe.nom}" :\nCotisation : ${fmtFCFA(groupe.montant)}\nMerci de regler.\nVia HABY Tontine`);window.open(`https://wa.me/${m.tel.replace(/[\s+]/g,"")}?text=${msg}`,"_blank");};
  const sendWAG=()=>{const msg=encodeURIComponent(`Rappel HABY Tontine - ${groupe.nom}\n\nCotisation : ${fmtFCFA(groupe.montant)}\nEn retard : ${enRet.map(m=>m.prenom).join(", ")||"aucun"}\nA jour : ${aJour.map(m=>m.prenom).join(", ")}\n\nMerci a toutes !`);window.open(`https://wa.me/?text=${msg}`,"_blank");};

  const TABS=[["membres","Membres"],["events","Evenements"],["checklist","Taches"],["social","Social"],["rapport","Rapport"]];
  return(
    <div style={{paddingBottom:16}}>
      <div style={{background:"#0F2419",padding:"44px 16px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #1B4332"}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#FDF6EC",fontSize:24,cursor:"pointer",padding:0}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#FDF6EC",margin:0,fontSize:17,fontWeight:800}}>{groupe.nom}</h2><p style={{color:"#D4A843",margin:0,fontSize:12}}>{groupe.frequence} - {fmtFCFA(groupe.montant)}/cotisation</p></div>
        <button onClick={()=>{setEditG({nom:groupe.nom,montant:String(groupe.montant),frequence:groupe.frequence});setShowEdit(true);}} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:8,padding:"5px 10px",color:"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer"}}>Modifier</button>
        <button onClick={deleteGroupe} style={{background:"transparent",border:"1px solid #C1440E",borderRadius:8,padding:"5px 10px",color:"#EF4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>Suppr.</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"14px 16px 0"}}>
        {[["Collecte",fmtFCFA(collecte),"💰"],["Cagnotte tour",fmtFCFA(cagnotteTour),"🏆"],["Ponctualite",`${taux}%`,"📊"],["Caisse soc.",fmtFCFA(groupe.caisseSociale),"🏦"],["A jour",`${aJour.length}/${groupe.membres.length}`,"✅"],["En retard",`${enRet.length}`,"⚠️"]].map(([l,v,i])=>(
          <div key={l} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 8px",textAlign:"center"}}><p style={{margin:0,fontSize:16}}>{i}</p><p style={{margin:"4px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:12}}>{v}</p><p style={{margin:0,color:"#6B7280",fontSize:10}}>{l}</p></div>
        ))}
      </div>
      <div style={{margin:"12px 16px 0"}}><button onClick={sendWAG} style={{width:"100%",background:"#075E54",border:"none",borderRadius:12,padding:"12px",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>Rappel WhatsApp au groupe complet</button></div>
      <div style={{display:"flex",gap:6,padding:"14px 16px 0",overflowX:"auto"}}>
        {TABS.map(([id,lbl])=><button key={id} onClick={()=>setTab(id)} style={{flexShrink:0,padding:"7px 12px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===id?"#D4A843":"#0F2419",color:tab===id?"#0A1A0F":"#6B7280",borderColor:tab===id?"#D4A843":"#1B4332"}}>{lbl}</button>)}
      </div>

      {tab==="membres"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"linear-gradient(135deg,#0F2419,#1A2E1F)",border:"1px solid #D4A843",borderRadius:14,padding:14,marginBottom:12}}>
          <p style={{margin:"0 0 10px",color:"#D4A843",fontWeight:800,fontSize:13}}>Budget du groupe</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            {[["Budget total cycle",fmtFCFA(cagnotteTour)],["Deja collecte",fmtFCFA(collecte)],["Reste a collecter",fmtFCFA(Math.max(0,cagnotteTour-collecte))],["Caisse sociale",fmtFCFA(groupe.caisseSociale)]].map(([l,v])=>(
              <div key={l} style={{background:"#0A1A0F",borderRadius:10,padding:"8px 10px"}}>
                <p style={{margin:0,color:"#6B7280",fontSize:10,fontWeight:600}}>{l}</p>
                <p style={{margin:"3px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:12}}>{v}</p>
              </div>
            ))}
          </div>
          <Bar pct={cagnotteTour>0?Math.round((collecte/cagnotteTour)*100):0} c="#D4A843"/>
          <p style={{margin:"5px 0 0",color:"#6B7280",fontSize:11,textAlign:"right"}}>{cagnotteTour>0?Math.round((collecte/cagnotteTour)*100):0}% collecte ce cycle</p>
        </div>
        {groupe.dateEcheance&&<div style={{background:"#1A0800",border:"1px solid #C1440E",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><p style={{margin:0,color:"#EF4444",fontWeight:700,fontSize:13}}>Echeance : {groupe.dateEcheance}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>{enRet.length} membre(s) pas encore paye</p></div>
          <button onClick={sendRappelEcheance} style={{background:"#C1440E",border:"none",borderRadius:10,padding:"8px 12px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>Rappeler</button>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <p style={{color:"#22C55E",fontSize:12,fontWeight:700,margin:0}}>A JOUR ({aJour.length})</p>
          <button onClick={()=>setShowAdd(true)} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:8,padding:"5px 12px",color:"#D4A843",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Membre</button>
        </div>
        {aJour.map(m=><MembreRow key={m.id} m={m} onToggle={()=>toggleP(m.id)} onWA={()=>sendWA(m)} montant={groupe.montant} onVersement={openVers} onHistorique={openHisto} onDelete={delM} onPhoto={updatePhoto}/>)}
        {enRet.length>0&&<><p style={{color:"#EF4444",fontSize:12,fontWeight:700,margin:"16px 0 8px"}}>EN RETARD ({enRet.length})</p>{enRet.map(m=><MembreRow key={m.id} m={m} onToggle={()=>toggleP(m.id)} onWA={()=>sendWA(m)} montant={groupe.montant} onVersement={openVers} onHistorique={openHisto} onDelete={delM} onPhoto={updatePhoto}/>)}</>}
      </div>}

      {tab==="events"&&<div style={{padding:"14px 16px 0"}}>
        {groupe.membres.filter(m=>m.evenement).length===0
          ?<div style={{textAlign:"center",padding:30,color:"#2D6A4F"}}><p style={{fontSize:32}}>🎉</p><p>Aucun evenement signale</p></div>
          :groupe.membres.filter(m=>m.evenement).map(m=><div key={m.id} style={{background:"#0F2419",border:"1px solid #D4A843",borderRadius:14,padding:"14px 16px",marginBottom:10,display:"flex",gap:12,alignItems:"center"}}><Avatar prenom={m.prenom} size={42}/><div style={{flex:1}}><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{m.prenom}</p><p style={{margin:"3px 0 0",color:"#D4A843",fontSize:13}}>{m.evenement}</p></div><button onClick={()=>openEvt(m)} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"7px 10px",color:"#D4A843",fontSize:12,fontWeight:700,cursor:"pointer"}}>Modifier</button><button onClick={()=>sendWA(m)} style={{background:"#075E54",border:"none",borderRadius:10,padding:"7px 10px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>WA</button></div>)}
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"18px 0 8px",letterSpacing:.5}}>SIGNALER UN EVENEMENT</p>
        {groupe.membres.filter(m=>!m.evenement).map(m=><div key={m.id} onClick={()=>openEvt(m)} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center",cursor:"pointer"}}><Avatar prenom={m.prenom} size={32}/><p style={{margin:0,color:"#FDF6EC",fontSize:13,flex:1}}>{m.prenom}</p><span style={{color:"#D4A843",fontSize:12,fontWeight:700}}>+ Ajouter</span></div>)}
      </div>}

      {evtM&&<Modal onClose={()=>setEvtM(null)}>
        <MH title={`Evenement - ${evtM.prenom}`} onClose={()=>setEvtM(null)}/>
        <Fld label="Description (mariage, naissance, deces, etc.)"><Inp value={evtTxt} onChange={e=>setEvtTxt(e.target.value)} placeholder="Ex: Bapteme bebe le 12 Juil" maxLength={80} autoFocus/></Fld>
        <div style={{display:"flex",gap:10}}>
          <Btn onClick={saveEvt}>Enregistrer</Btn>
          {evtM.evenement&&<button onClick={()=>{setEvtTxt("");saveEvt();}} style={{flex:1,background:"transparent",border:"1px solid #C1440E",borderRadius:14,padding:"13px",color:"#EF4444",fontWeight:700,fontSize:14,cursor:"pointer"}}>Retirer</button>}
        </div>
      </Modal>}

      {tab==="checklist"&&<div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,marginBottom:12}}>{groupe.checklist.filter(c=>c.done).length}/{groupe.checklist.length} taches completees</p>
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          <Inp value={newTask} onChange={e=>setNewTask(e.target.value)} placeholder="Nouvelle tache..." maxLength={100} onKeyDown={e=>{if(e.key==="Enter")addTask();}}/>
          <button onClick={addTask} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"0 16px",color:"#D4A843",fontWeight:700,fontSize:20,cursor:"pointer"}}>+</button>
        </div>
        {groupe.checklist.length===0&&<div style={{textAlign:"center",padding:20,color:"#2D6A4F"}}><p>Aucune tache pour le moment</p></div>}
        {groupe.checklist.map(c=><div key={c.id} style={{background:"#0F2419",border:`1px solid ${c.done?"#D4A843":"#1B4332"}`,borderRadius:12,padding:"14px 16px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}><div onClick={()=>toggleC(c.id)} style={{width:22,height:22,borderRadius:6,border:`2px solid ${c.done?"#D4A843":"#2D6A4F"}`,background:c.done?"#D4A843":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer"}}>{c.done&&<span style={{color:"#0A1A0F",fontWeight:900,fontSize:13}}>v</span>}</div><p onClick={()=>toggleC(c.id)} style={{margin:0,color:c.done?"#6B7280":"#FDF6EC",fontSize:14,textDecoration:c.done?"line-through":"none",flex:1,cursor:"pointer"}}>{c.label}</p><button onClick={()=>delTask(c.id)} style={{background:"transparent",border:"none",color:"#EF4444",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button></div>)}
      </div>}

      {tab==="social"&&<div style={{padding:"14px 16px 0"}}>
        {groupe.messages.map(m=><div key={m.id} style={{display:"flex",gap:10,marginBottom:12}}><Avatar prenom={m.auteur} size={34} gold={m.auteur==="HABY"}/><div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:"0 14px 14px 14px",padding:"10px 14px",flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><p style={{margin:0,color:"#D4A843",fontSize:12,fontWeight:700}}>{m.auteur}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>{m.time}</p></div><p style={{margin:0,color:"#FDF6EC",fontSize:14}}>{m.texte}</p></div></div>)}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input value={msgInput} onChange={e=>setMsgInput(s(e.target.value))} placeholder="Ecrire un message..." maxLength={200} onKeyDown={e=>e.key==="Enter"&&sendMsg()} style={{flex:1,background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 14px",color:"#FDF6EC",fontSize:14,outline:"none"}}/>
          <button onClick={sendMsg} style={{background:"#D4A843",border:"none",borderRadius:12,padding:"0 16px",color:"#0A1A0F",fontWeight:900,cursor:"pointer",fontSize:18}}>→</button>
        </div>
      </div>}

      {tab==="rapport"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:16,padding:16,marginBottom:14}}>
          <p style={{color:"#D4A843",fontWeight:800,margin:"0 0 14px",fontSize:15}}>Bilan - Cycle {groupe.cycle}/{groupe.totalCycles}</p>
          {[["Total collecte ce cycle",fmtFCFA(collecte)],["Cagnotte du tour (calcul auto)",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux ponctualite",`${taux}%`],["Membres a jour",`${aJour.length}/${groupe.membres.length}`],["Prochain tour",groupe.prochainTour],["Cycles restants",groupe.totalCycles-groupe.cycle],["Total fin de cycle",fmtFCFA(groupe.membres.length*groupe.montant*groupe.totalCycles)]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #1B4332"}}><span style={{color:"#6B7280",fontSize:13}}>{l}</span><span style={{color:"#FDF6EC",fontWeight:700,fontSize:13}}>{v}</span></div>)}
        </div>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,marginBottom:8}}>SUIVI PAR MEMBRE</p>
        {groupe.membres.map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1B4332"}}><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={m.prenom} size={32}/><p style={{margin:0,color:"#FDF6EC",fontSize:13}}>{m.prenom}</p></div><div style={{textAlign:"right"}}><p style={{margin:0,color:"#D4A843",fontSize:12,fontWeight:700}}>{fmtFCFA(m.cyclesPaies*groupe.montant)}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>{m.cyclesPaies}/{m.cyclesTotal} cycles</p></div></div>)}
        <Btn onClick={()=>onToast("Rapport PDF exporte")}>Exporter rapport PDF</Btn>
      </div>}

      {showVers&&versM&&<Modal onClose={()=>setShowVers(false)}>
        <MH title={"+ Versement - "+versM.prenom} onClose={()=>setShowVers(false)}/>
        <div style={{background:"#0A1A0F",borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#6B7280",fontSize:13}}>Total deja verse</span>
            <span style={{color:"#D4A843",fontWeight:700}}>{fmtFCFA(versM.versements||0)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:"#6B7280",fontSize:13}}>Cotisation du mois</span>
            <span style={{color:"#FDF6EC",fontWeight:700}}>{fmtFCFA(groupe.montant)}</span>
          </div>
        </div>
        <Fld label="Montant recu (FCFA)">
          <Inp value={versAmt} onChange={e=>setVersAmt(e.target.value.replace(/[^0-9]/g,""))} placeholder={"Ex: "+String(groupe.montant)} inputMode="numeric" autoFocus/>
        </Fld>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {[groupe.montant,Math.round(groupe.montant/2),groupe.montant*2].map(v=>(
            <button key={v} onClick={()=>setVersAmt(String(v))} style={{flex:1,background:versAmt===String(v)?"#D4A843":"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 4px",color:versAmt===String(v)?"#0A1A0F":"#FDF6EC",fontSize:11,fontWeight:700,cursor:"pointer"}}>{fmtFCFA(v)}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>saveVers(false)} disabled={!versAmt||Number(versAmt)<1} style={{flex:1,background:!versAmt||Number(versAmt)<1?"#1B4332":"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:14,padding:"13px",color:!versAmt||Number(versAmt)<1?"#6B7280":"#0A1A0F",fontWeight:800,fontSize:14,cursor:"pointer"}}>Enregistrer</button>
          <button onClick={()=>saveVers(true)} disabled={!versAmt||Number(versAmt)<1} style={{flex:1,background:!versAmt||Number(versAmt)<1?"#1B4332":"#075E54",border:"none",borderRadius:14,padding:"13px",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer"}}>+ Recu WA</button>
        </div>
      </Modal>}

      {showHisto&&histoM&&<Modal onClose={()=>setShowHisto(false)}>
        <MH title={"Historique - "+histoM.prenom} onClose={()=>setShowHisto(false)}/>
        <div style={{background:"#0A1A0F",borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#6B7280",fontSize:13}}>Total verse</span>
            <span style={{color:"#D4A843",fontWeight:800,fontSize:16}}>{fmtFCFA(histoM.versements||0)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{color:"#6B7280",fontSize:13}}>Cycles payes</span>
            <span style={{color:"#22C55E",fontWeight:700}}>{histoM.cyclesPaies} / {histoM.cyclesTotal}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{color:"#6B7280",fontSize:13}}>Fiabilite</span>
            <span style={{color:"#D4A843",fontWeight:700}}>{histoM.score}%</span>
          </div>
        </div>
        <p style={{color:"#6B7280",fontSize:11,fontWeight:700,marginBottom:10,letterSpacing:.5}}>DETAIL DES PAIEMENTS</p>
        {(histoM.historique||[]).length===0&&<p style={{color:"#2D6A4F",textAlign:"center",padding:20}}>Aucun historique disponible</p>}
        {(histoM.historique||[]).map((h,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:"#0F2419",borderRadius:12,marginBottom:8,border:`1px solid ${h.statut==="paye"?"#1B4332":h.statut==="retard"?"#C1440E44":"#1B4332"}`}}>
            <div>
              <p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{h.mois}</p>
              {h.date&&<p style={{margin:0,color:"#6B7280",fontSize:11}}>Paye le {h.date}</p>}
            </div>
            <div style={{textAlign:"right"}}>
              <p style={{margin:0,color:h.statut==="paye"?"#D4A843":h.statut==="retard"?"#EF4444":"#6B7280",fontWeight:700,fontSize:14}}>{fmtFCFA(h.montant)}</p>
              <span style={{background:h.statut==="paye"?"#1B6B45":h.statut==="retard"?"#C1440E":"#1B4332",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99}}>{h.statut.toUpperCase()}</span>
            </div>
          </div>
        ))}
        <div style={{background:"linear-gradient(135deg,#0F2419,#1A2E1F)",border:"1px solid #D4A843",borderRadius:12,padding:14,marginTop:8}}>
          <p style={{margin:"0 0 8px",color:"#D4A843",fontWeight:800,fontSize:13}}>Devis automatique</p>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#6B7280",fontSize:12}}>Total paye</span><span style={{color:"#22C55E",fontWeight:700}}>{fmtFCFA(histoM.versements||0)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{color:"#6B7280",fontSize:12}}>Paiements en retard</span><span style={{color:"#EF4444",fontWeight:700}}>{(histoM.historique||[]).filter(h=>h.statut==="retard").length} fois</span></div>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#6B7280",fontSize:12}}>Taux de ponctualite</span><span style={{color:"#D4A843",fontWeight:700}}>{histoM.cyclesTotal>0?Math.round((histoM.cyclesPaies/histoM.cyclesTotal)*100):0}%</span></div>
        </div>
      </Modal>}

      {showAdd&&<Modal onClose={()=>setShowAdd(false)}>
        <MH title="Ajouter un membre" onClose={()=>setShowAdd(false)}/>
        <p style={{color:"#6B7280",fontSize:13,marginBottom:16,lineHeight:1.6}}>Le chef de tontine ajoute les membres. Un rappel WhatsApp leur sera envoye.</p>
        {"contacts" in navigator&&"ContactsManager" in window&&<button disabled={pickerBusy} onClick={async()=>{
          if(pickerBusy)return;
          setPickerBusy(true);
          try{
            const c=await navigator.contacts.select(["name","tel"],{multiple:false});
            if(c&&c[0]){setNewM(n=>({...n,prenom:c[0].name?.[0]?.split(" ")[0]||n.prenom,tel:sPhone(c[0].tel?.[0]||n.tel)}));onToast("Contact selectionne !");}
          }catch{}
          finally{setPickerBusy(false);}
        }} style={{width:"100%",background:pickerBusy?"#0F2419":"#1B4332",border:"1px solid #D4A843",borderRadius:12,padding:"12px",color:pickerBusy?"#6B7280":"#D4A843",fontWeight:700,fontSize:13,cursor:pickerBusy?"not-allowed":"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{pickerBusy?"Ouverture des contacts...":"📇 Choisir depuis mes contacts"}</button>}
        <Fld label="Photo (optionnel)"><div style={{display:"flex",alignItems:"center",gap:12}}>{newM.photo?<img src={newM.photo} style={{width:50,height:50,borderRadius:14,objectFit:"cover"}} alt=""/>:<div style={{width:50,height:50,borderRadius:14,background:"#1B4332",display:"flex",alignItems:"center",justifyContent:"center",color:"#6B7280",fontSize:20}}>📷</div>}<label style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 14px",color:"#D4A843",fontWeight:700,fontSize:12,cursor:"pointer"}}>{newM.photo?"Changer":"Ajouter"}<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>4*1024*1024)return onToast("Photo max 4 Mo","error");const r=new FileReader();r.onload=ev=>setNewM(n=>({...n,photo:ev.target.result}));r.readAsDataURL(f);}}/></label></div></Fld>
        <Fld label="Prenom"><Inp value={newM.prenom} onChange={e=>setNewM(n=>({...n,prenom:e.target.value}))} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
        <Fld label="Numero WhatsApp"><Inp value={newM.tel} onChange={e=>setNewM(n=>({...n,tel:sPhone(e.target.value)}))} placeholder="+223 76 XX XX XX" type="tel" maxLength={16}/></Fld>
        <Fld label="Quartier (optionnel)"><Inp value={newM.quartier||""} onChange={e=>setNewM(n=>({...n,quartier:e.target.value}))} placeholder="Ex: Hamdallaye ACI" maxLength={40}/></Fld>
        <Btn onClick={addM} disabled={pickerBusy}>{pickerBusy?"Ajout...":"Ajouter ce membre"}</Btn>
      </Modal>}
      {showEdit&&<Modal onClose={()=>setShowEdit(false)}>
        <MH title="Modifier la tontine" onClose={()=>setShowEdit(false)}/>
        <Fld label="Nom"><Inp value={editG.nom} onChange={e=>setEditG(g=>({...g,nom:e.target.value}))} placeholder="Nom de la tontine" maxLength={40} autoFocus/></Fld>
        <Fld label="Montant par cotisation (FCFA)"><Inp value={editG.montant} onChange={e=>setEditG(g=>({...g,montant:e.target.value.replace(/\D/g,"")}))} placeholder="25000" inputMode="numeric"/></Fld>
        <Fld label="Frequence"><div style={{display:"flex",gap:8}}>{["Hebdo","Bimensuel","Mensuel"].map(f=><button key={f} onClick={()=>setEditG(g=>({...g,frequence:f}))} style={{flex:1,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:editG.frequence===f?"#D4A843":"#1B4332",color:editG.frequence===f?"#0A1A0F":"#FDF6EC",borderColor:editG.frequence===f?"#D4A843":"#2D6A4F"}}>{f}</button>)}</div></Fld>
        <Btn onClick={saveEdit} disabled={editBusy}>{editBusy?"Enregistrement...":"Enregistrer"}</Btn>
      </Modal>}
    </div>
  );
};

const HabyScreen = ({groupes}) => {
  const [msgs,setMsgs]=useState([{role:"assistant",content:"Salut ! Je suis HABY, ton assistante HABY Tontine. Pose-moi tes questions sur ta tontine, ton epargne ou tes finances !"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const bottomRef=useRef();
  const {listening,toggle:toggleMic}=useVoiceInput(t=>setInput(p=>p?`${p} ${t}`:t));

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);

  const send=async(txt)=>{
    const text=(txt!==undefined?txt:input).trim();
    if(!text||loading)return;
    setInput("");setLoading(true);
    const newMsgs=[...msgs,{role:"user",content:text}];
    setMsgs(newMsgs);
    const ctx=groupes.map(g=>`Tontine "${g.nom}": ${g.membres.length} membres, ${fmtFCFA(g.montant)}/cycle, cycle ${g.cycle}/${g.totalCycles}, ${g.membres.filter(m=>m.paye).length} payes.`).join("\n");
    try{
      const system=`Tu es HABY, l assistante IA officielle de HABY Tontine, une application africaine de gestion de tontines, cagnottes et epargne.

Ton role :
- Tu aides les utilisatrices a comprendre et gerer leurs tontines : calculs de cotisations, suivi des paiements, epargne, conseils financiers simples et concrets adaptes a leur contexte (Afrique de l Ouest francophone, FCFA).
- Quand on te donne un calcul a faire (montant total, part par membre, nombre de cycles restants, etc.), fais-le toi-meme etape par etape mentalement et donne directement le resultat exact, jamais une estimation vague.
- Si la question sort du cadre tontine/epargne/finances personnelles, tu peux quand meme repondre utilement mais brievement, sans jamais inventer d informations sur l app HABY Tontine elle-meme si tu ne les connais pas via le contexte fourni.
- Ne demande jamais d informations sensibles (PIN, mot de passe, numero de carte).

Ton style :
- Francais simple, chaleureux, direct, jamais condescendant.
- Reponses courtes par defaut (2 a 4 phrases), mais tu peux developper un peu plus si la question est complexe ou demande un calcul detaille.
- Tu peux utiliser un emoji occasionnellement, sans en abuser.

Donnees reelles des tontines de l utilisatrice en ce moment : ${ctx||"aucune tontine pour le moment"}.`;
      const {data,error}=await supabase.functions.invoke("haby-chat",{body:{system,messages:newMsgs}});
      if(error){
        let detail=error.message||"inconnue";
        try{if(error.context?.json){const body=await error.context.json();detail=body.error||detail;}}catch{}
        throw new Error(detail);
      }
      const reply=data?.content?.map(b=>b.text||"").join("")||"Desole, reessaie !";
      setMsgs([...newMsgs,{role:"assistant",content:reply}]);
    }catch(e){setMsgs([...newMsgs,{role:"assistant",content:"Erreur technique : "+(e?.message||"inconnue")}]);}
    setLoading(false);
  };

  const sugg=["C est quand mon tour ?","Qui n a pas paye ?","Combien j ai epargne ?","Conseils pour mon groupe"];
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 78px)",background:"#0A1A0F"}}>
      <div style={{background:"#0F2419",padding:"44px 16px 14px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid #1B4332",flexShrink:0}}>
        <div style={{width:46,height:46,background:"linear-gradient(135deg,#D4A843,#B8922E)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,color:"#0A1A0F",flexShrink:0}}>H</div>
        <div><p style={{margin:0,color:"#FDF6EC",fontWeight:800,fontSize:16}}>HABY</p><p style={{margin:0,color:"#22C55E",fontSize:11}}>En ligne - Assistante HABY Tontine</p></div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 0"}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:12,alignItems:"flex-end",gap:8}}>
            {m.role==="assistant"&&<div style={{width:28,height:28,background:"#D4A843",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:"#0A1A0F",flexShrink:0}}>H</div>}
            <div style={{background:m.role==="user"?"linear-gradient(135deg,#D4A843,#B8922E)":"#0F2419",border:m.role==="user"?"none":"1px solid #1B4332",borderRadius:m.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",padding:"12px 16px",color:m.role==="user"?"#0A1A0F":"#FDF6EC",fontSize:14,maxWidth:"80%",lineHeight:1.6,fontWeight:m.role==="user"?700:400}}>{m.content}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:8,alignItems:"flex-end",marginBottom:12}}><div style={{width:28,height:28,background:"#D4A843",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:"#0A1A0F"}}>H</div><div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:"18px 18px 18px 4px",padding:"14px 18px",color:"#D4A843",fontSize:20,letterSpacing:4}}>...</div></div>}
        <div ref={bottomRef}/>
      </div>
      {msgs.length<=2&&<div style={{display:"flex",gap:8,padding:"8px 16px",overflowX:"auto",flexShrink:0}}>{sugg.map(sg=><button key={sg} onClick={()=>send(sg)} style={{flexShrink:0,background:"#0F2419",border:"1px solid #1B4332",borderRadius:99,padding:"8px 14px",color:"#D4A843",fontSize:12,cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>{sg}</button>)}</div>}
      <div style={{display:"flex",gap:8,padding:"12px 16px 28px",background:"#0A1A0F",borderTop:"1px solid #1B4332",flexShrink:0}}>
        <button onClick={toggleMic} title="Dicter un message" style={{width:46,height:50,background:listening?"#C1440E":"#0F2419",border:"1px solid #2D6A4F",borderRadius:14,color:listening?"#fff":"#D4A843",fontSize:18,cursor:"pointer",flexShrink:0}}>{listening?"⏹":"🎤"}</button>
        <input value={input} onChange={e=>setInput(e.target.value.replace(/[<>"]/g,"").slice(0,500))} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!loading){e.preventDefault();send();}}} placeholder="Ecris ou dicte a HABY..." style={{flex:1,background:"#0F2419",border:"1px solid #2D6A4F",borderRadius:14,padding:"14px 16px",color:"#FDF6EC",fontSize:15,outline:"none"}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading} style={{width:50,height:50,background:input.trim()&&!loading?"#D4A843":"#1B4332",border:"none",borderRadius:14,color:"#0A1A0F",fontWeight:900,fontSize:20,cursor:input.trim()&&!loading?"pointer":"not-allowed",flexShrink:0,alignSelf:"flex-end"}}>→</button>
      </div>
    </div>
  );
};

const EpargneScreen = ({onToast,user}) => {
  const [objs,setObjs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [nObj,setNObj]=useState({label:"",emoji:"🎯",cible:"",actuel:""});
  const [versObj,setVersObj]=useState(null);
  const [versAmt,setVersAmt]=useState("");
  const [busy,setBusy]=useState(false);
  const totalEp=objs.reduce((a,o)=>a+o.actuel,0);
  const totalC=objs.reduce((a,o)=>a+o.cible,0);

  const loadObjs=async()=>{
    setLoading(true);
    const {data,error}=await supabase.from("objectifs").select("*").eq("user_id",user.id).order("created_at",{ascending:true});
    if(error){onToast("Erreur de chargement de l epargne","error");setObjs([]);}
    else setObjs(data.map(o=>({...o,actuel:Number(o.actuel)||0,cible:Number(o.cible)||0})));
    setLoading(false);
  };
  useEffect(()=>{loadObjs();},[user.id]);

  const addObj=async()=>{
    if(!nObj.label.trim()||!nObj.cible)return onToast("Remplis tous les champs","error");
    setBusy(true);
    const payload={user_id:user.id,label:s(nObj.label.trim()),emoji:nObj.emoji,actuel:Number(nObj.actuel)||0,cible:Number(nObj.cible),couleur:"#D4A843"};
    const {data,error}=await supabase.from("objectifs").insert(payload).select().single();
    setBusy(false);
    if(error)return onToast("Impossible d ajouter l objectif","error");
    setObjs(o=>[...o,{...data,actuel:Number(data.actuel)||0,cible:Number(data.cible)||0}]);
    setNObj({label:"",emoji:"🎯",cible:"",actuel:""});setShowAdd(false);onToast("Objectif ajoute !");
  };

  const delObj=async(o)=>{
    const {error}=await supabase.from("objectifs").delete().eq("id",o.id);
    if(error)return onToast("Suppression impossible","error");
    setObjs(list=>list.filter(x=>x.id!==o.id));onToast("Objectif supprime");
  };

  const openVersement=(o)=>{setVersObj(o);setVersAmt("");};
  const addVersement=async()=>{
    const montant=Number(versAmt);
    if(!montant||montant<=0)return onToast("Montant invalide","error");
    setBusy(true);
    const nouveauMontant=versObj.actuel+montant;
    const {data,error}=await supabase.from("objectifs").update({actuel:nouveauMontant}).eq("id",versObj.id).select().single();
    setBusy(false);
    if(error)return onToast("Versement impossible","error");
    setObjs(list=>list.map(o=>o.id===versObj.id?{...o,actuel:Number(data.actuel)||nouveauMontant}:o));
    onToast(nouveauMontant>=versObj.cible?"Objectif atteint ! 🎉":"Versement ajoute !");
    setVersObj(null);setVersAmt("");
  };

  return(
    <div style={{paddingBottom:16}}>
      <div style={{padding:"44px 16px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{color:"#FDF6EC",fontSize:22,fontWeight:900,margin:0}}>Ma Tirelire</h2>
        <button onClick={()=>setShowAdd(true)} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 16px",color:"#D4A843",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Objectif</button>
      </div>
      <div style={{margin:"14px 16px 0",background:"linear-gradient(135deg,#1B4332,#0F2419)",borderRadius:16,padding:16,border:"1px solid #2D6A4F"}}>
        <p style={{margin:0,color:"#6B7280",fontSize:12,fontWeight:600}}>TOTAL EPARGNE</p>
        <p style={{margin:"4px 0 0",color:"#D4A843",fontSize:26,fontWeight:900}}>{fmtFCFA(totalEp)}</p>
        <Bar pct={totalC>0?Math.round((totalEp/totalC)*100):0} c="#D4A843"/>
        <p style={{margin:"6px 0 0",color:"#6B7280",fontSize:11}}>Objectif global : {fmtFCFA(totalC)}</p>
      </div>
      <div style={{padding:"14px 16px 0"}}>
        {loading?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:20}}>Chargement...</p>
        :objs.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:20}}>Aucun objectif pour le moment. Cree ton premier objectif d epargne !</p>
        :objs.map(o=>{const pct=o.cible>0?Math.round((o.actuel/o.cible)*100):0;return(
          <div key={o.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:16,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:26}}>{o.emoji}</span><div><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:15}}>{o.label}</p><p style={{margin:0,color:"#6B7280",fontSize:12}}>{fmtFCFA(o.actuel)} / {fmtFCFA(o.cible)}</p></div></div><span style={{color:o.couleur,fontWeight:900,fontSize:20}}>{pct}%</span></div>
            <Bar pct={pct} c={o.couleur}/>
            {pct>=100?<p style={{color:"#22C55E",fontSize:12,margin:"8px 0 0",fontWeight:700}}>Objectif atteint !</p>:<p style={{color:"#6B7280",fontSize:11,margin:"6px 0 0"}}>Reste {fmtFCFA(o.cible-o.actuel)}</p>}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={()=>openVersement(o)} style={{flex:1,background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px",color:"#D4A843",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Versement</button>
              <button onClick={()=>delObj(o)} style={{background:"transparent",border:"1px solid #C1440E",borderRadius:10,padding:"8px 12px",color:"#EF4444",fontWeight:700,fontSize:12,cursor:"pointer"}}>Suppr.</button>
            </div>
          </div>
        );})}
      </div>
      <div style={{margin:"6px 16px 0",background:"#0A1A0F",border:"1px solid #D4A843",borderRadius:14,padding:14}}>
        <p style={{margin:0,color:"#D4A843",fontWeight:700,fontSize:13}}>Conseil HABY</p>
        <p style={{margin:"6px 0 0",color:"#FDF6EC",fontSize:13,lineHeight:1.6}}>Epargne 10% de chaque cagnotte recue. En 12 mois tu peux cumuler 30 000 FCFA d epargne personnelle !</p>
      </div>
      {showAdd&&<Modal onClose={()=>setShowAdd(false)}>
        <MH title="Nouvel objectif" onClose={()=>setShowAdd(false)}/>
        <Fld label="Nom de l objectif"><Inp value={nObj.label} onChange={e=>setNObj(o=>({...o,label:e.target.value}))} placeholder="Ex: Hajj 2027" maxLength={40} autoFocus/></Fld>
        <Fld label="Emoji"><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["🎯","🏠","✈️","📚","💍","🌙","📱","🚗","🏥","💼","👶","🐑"].map(em=><button key={em} onClick={()=>setNObj(o=>({...o,emoji:em}))} style={{fontSize:22,background:nObj.emoji===em?"#D4A843":"#1B4332",border:"none",borderRadius:10,padding:8,cursor:"pointer"}}>{em}</button>)}</div></Fld>
        <Fld label="Montant cible (FCFA)"><Inp value={nObj.cible} onChange={e=>setNObj(o=>({...o,cible:e.target.value.replace(/\D/g,"")}))} placeholder="Ex: 500000" inputMode="numeric"/></Fld>
        <Fld label="Deja epargne (FCFA)"><Inp value={nObj.actuel} onChange={e=>setNObj(o=>({...o,actuel:e.target.value.replace(/\D/g,"")}))} placeholder="Ex: 50000" inputMode="numeric"/></Fld>
        <Btn onClick={addObj} disabled={busy}>{busy?"Ajout...":"Ajouter"}</Btn>
      </Modal>}
      {versObj&&<Modal onClose={()=>setVersObj(null)}>
        <MH title={`Verser sur "${versObj.label}"`} onClose={()=>setVersObj(null)}/>
        <Fld label="Montant du versement (FCFA)"><Inp value={versAmt} onChange={e=>setVersAmt(e.target.value.replace(/\D/g,""))} placeholder="Ex: 5000" inputMode="numeric" autoFocus/></Fld>
        <Btn onClick={addVersement} disabled={busy}>{busy?"Enregistrement...":"Confirmer le versement"}</Btn>
      </Modal>}
    </div>
  );
};

const SupportModal = ({onClose,onToast}) => {
  const [txt,setTxt]=useState("");
  const {listening,toggle:toggleMic}=useVoiceInput(t=>setTxt(p=>p?`${p} ${t}`:t),onToast);
  const send=()=>{
    if(!txt.trim())return onToast("Ecris ou dicte ton message d abord","error");
    window.open(`https://wa.me/22376908031?text=${encodeURIComponent("Support HABY Tontine : "+txt.trim())}`,"_blank");
    onClose();
  };
  return(
    <Modal onClose={onClose}>
      <MH title="Contacter le support" onClose={onClose}/>
      <p style={{color:"#6B7280",fontSize:12,margin:"0 0 12px",lineHeight:1.6}}>Ecris ton message ou dicte-le a voix haute, puis envoie-le a notre equipe sur WhatsApp.</p>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <textarea value={txt} onChange={e=>setTxt(e.target.value.slice(0,500))} placeholder="Explique ton probleme..." rows={4} style={{flex:1,background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:12,padding:"12px 14px",color:"#FDF6EC",fontSize:14,outline:"none",resize:"none",fontFamily:"inherit"}}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={toggleMic} style={{background:listening?"#C1440E":"#1B4332",border:"1px solid #2D6A4F",borderRadius:14,padding:"0 20px",color:listening?"#fff":"#D4A843",fontSize:18,cursor:"pointer"}}>{listening?"⏹ Stop":"🎤 Dicter"}</button>
        <Btn onClick={send}>Envoyer via WhatsApp</Btn>
      </div>
    </Modal>
  );
};

const AdminScreen = ({onBack,onToast,currentUserId}) => {
  const [users,setUsers]=useState([]);
  const [groupesCount,setGroupesCount]=useState(0);
  const [totalCollecte,setTotalCollecte]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState(null);
  useEffect(()=>{
    (async()=>{
      const [{data:us,error:e1},{count:gc},{data:txs,error:e3}]=await Promise.all([
        supabase.from("users").select("*").order("created_at",{ascending:false}),
        supabase.from("groupes").select("id",{count:"exact",head:true}),
        supabase.from("transactions").select("montant"),
      ]);
      if(e1)onToast("Erreur de chargement des utilisatrices","error");
      else setUsers(us||[]);
      if(!e3)setTotalCollecte((txs||[]).reduce((a,t)=>a+(Number(t.montant)||0),0));
      setGroupesCount(gc||0);
      setLoading(false);
    })();
  },[]);
  const totalUsers=users.length;
  const totalPremium=users.filter(u=>u.plan==="premium").length;
  const toggleAdmin=async(u)=>{
    const newRole=u.role==="admin"?"user":"admin";
    setBusyId(u.id);
    const {error}=await supabase.from("users").update({role:newRole}).eq("id",u.id);
    setBusyId(null);
    if(error)return onToast("Impossible de changer le role","error");
    setUsers(list=>list.map(x=>x.id===u.id?{...x,role:newRole}:x));
    onToast(newRole==="admin"?`${u.prenom} est maintenant co-administrateur !`:`${u.prenom} n est plus administrateur`);
    if(newRole==="admin"){
      supabase.functions.invoke("send-push",{body:{user_id:u.id,title:"HABY Tontine",body:"Tu es maintenant co-administrateur de la plateforme !"}}).catch(()=>{});
    }
  };
  return(
    <div style={{paddingBottom:16}}>
      <div style={{padding:"44px 16px 0",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#D4A843",fontSize:22,cursor:"pointer"}}>←</button>
        <h2 style={{color:"#FDF6EC",fontSize:20,fontWeight:900,margin:0}}>Panneau Administrateur</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"14px 16px 0"}}>
        {[["UTILISATRICES",totalUsers],["PREMIUM",totalPremium],["TONTINES CREEES",groupesCount],["TOTAL COLLECTE",fmtFCFA(totalCollecte)]].map(([l,v])=>(
          <div key={l} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:14}}>
            <p style={{margin:0,color:"#6B7280",fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{margin:"4px 0 0",color:"#D4A843",fontSize:20,fontWeight:900}}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{margin:"12px 16px 0",background:"#0A1A0F",border:"1px solid #2D6A4F",borderRadius:12,padding:12}}>
        <p style={{margin:0,color:"#6B7280",fontSize:11,lineHeight:1.6}}>✅ Toutes ces donnees sont desormais 100% reelles : tontines, membres et cotisations viennent directement de Supabase, tous comptes confondus.</p>
      </div>
      <div style={{padding:"14px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>UTILISATRICES INSCRITES</p>
        {loading?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:20}}>Chargement...</p>
        :users.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:20}}>Aucune utilisatrice pour le moment</p>
        :users.map(u=><div key={u.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <Avatar prenom={u.prenom} photo={u.photo_url} size={38}/>
          <div style={{flex:1,minWidth:120}}>
            <p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{u.prenom}{u.role==="admin"&&<span style={{marginLeft:6,color:"#D4A843",fontSize:10,fontWeight:900}}>ADMIN</span>}</p>
            <p style={{margin:"2px 0 0",color:"#6B7280",fontSize:12}}>{u.telephone}</p>
          </div>
          <span style={{background:u.plan==="premium"?"#D4A843":"#1B4332",color:u.plan==="premium"?"#0A1A0F":"#6B7280",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99}}>{u.plan==="premium"?"PREMIUM":"GRATUIT"}</span>
          {u.id!==currentUserId&&<button onClick={()=>toggleAdmin(u)} disabled={busyId===u.id} style={{background:u.role==="admin"?"transparent":"#1B4332",border:`1px solid ${u.role==="admin"?"#C1440E":"#2D6A4F"}`,borderRadius:10,padding:"6px 10px",color:u.role==="admin"?"#EF4444":"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%",marginTop:2}}>{busyId===u.id?"...":u.role==="admin"?"Retirer admin":"Nommer co-admin"}</button>}
        </div>)}
      </div>
    </div>
  );
};

const VAPID_PUBLIC_KEY="BCkH2-70XXEE0xobtKRkfBGuwUWpTh_GBrIXVvJ4dGvql0ZUxVrtzRwCv23hRPqYBcufOvgZhepTIqWjwq4zjTw";
const urlBase64ToUint8Array=(base64String)=>{
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)));
};

const ProfilScreen = ({user,onLogout,onToast,onUpgrade,onOpenAdmin,lang,onChangeLang}) => {
  const [showOut,setShowOut]=useState(false);
  const [showSupport,setShowSupport]=useState(false);
  const [notifBusy,setNotifBusy]=useState(false);
  const enableNotifications=async()=>{
    if(!("serviceWorker" in navigator)||!("PushManager" in window))return onToast("Notifications non supportees sur ce navigateur","error");
    setNotifBusy(true);
    try{
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){setNotifBusy(false);return onToast("Autorisation refusee","error");}
      const reg=await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
      const {error}=await supabase.from("push_subscriptions").upsert({user_id:user.id,subscription:sub.toJSON()},{onConflict:"user_id"});
      setNotifBusy(false);
      if(error)return onToast("Impossible d activer les notifications","error");
      onToast("Notifications activees !");
    }catch(e){setNotifBusy(false);onToast("Erreur : "+(e.message||"inconnue"),"error");}
  };
  return(
    <div style={{paddingBottom:16}}>
      <div style={{background:"linear-gradient(135deg,#0F2419,#1B4332)",padding:"44px 20px 30px"}}>
        <h2 style={{color:"#FDF6EC",margin:"0 0 20px",fontSize:20,fontWeight:800}}>{t("profil")}</h2>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <Avatar prenom={user.prenom} photo={user.photo} size={76} gold/>
          <div>
            <p style={{margin:0,color:"#FDF6EC",fontSize:20,fontWeight:900}}>{user.prenom}</p>
            <p style={{margin:"3px 0 0",color:"#6B7280",fontSize:13}}>{user.tel}</p>
            <span style={{background:user.plan==="premium"?"#D4A843":"#1B4332",color:user.plan==="premium"?"#0A1A0F":"#D4A843",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,marginTop:6,display:"inline-block"}}>{user.plan==="premium"?t("premium"):t("gratuit")}</span>
          </div>
        </div>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:14,marginBottom:16}}>
          <p style={{margin:"0 0 10px",color:"#6B7280",fontSize:12,fontWeight:700}}>{t("langue")}</p>
          <div style={{display:"flex",gap:8}}>
            {[["fr","Francais"],["en","English"],["ar","العربية"]].map(([code,label])=>(
              <button key={code} onClick={()=>onChangeLang(code)} style={{flex:1,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:lang===code?"#D4A843":"#1B4332",color:lang===code?"#0A1A0F":"#FDF6EC",borderColor:lang===code?"#D4A843":"#2D6A4F"}}>{label}</button>
            ))}
          </div>
        </div>
        {user.plan==="free"&&<div style={{background:"linear-gradient(135deg,#1A0800,#3D1500)",border:"1px solid #D4A843",borderRadius:18,padding:18,marginBottom:16}}>
          <p style={{margin:"0 0 4px",color:"#D4A843",fontWeight:800,fontSize:16}}>Passer a HABY Premium</p>
          <p style={{margin:"0 0 14px",color:"#FDF6EC",fontSize:13,lineHeight:1.6}}>Debloque toutes les fonctionnalites pour developper tes tontines !</p>
          <div style={{background:"#0A1A0F",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"flex-end",gap:20,marginBottom:8}}><span style={{color:"#6B7280",fontSize:11,fontWeight:700,width:70,textAlign:"center"}}>GRATUIT</span><span style={{color:"#D4A843",fontSize:11,fontWeight:800,width:80,textAlign:"center"}}>PREMIUM</span></div>
            {[["Tontines actives","3 max","Illimite"],["Membres/groupe","15 max","Illimite"],["Export PDF","Non","Oui"],["Rappels SMS","Non","Oui"],["Caisse sociale","Non","Oui"],["HABY IA","Basique","Prioritaire"],["Support","Standard","24h"]].map(([f,fr,pr])=>(
              <div key={f} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1B4332",fontSize:12}}>
                <span style={{color:"#6B7280"}}>{f}</span>
                <div style={{display:"flex",gap:20}}><span style={{color:fr==="Non"?"#EF4444":"#6B7280",width:70,textAlign:"center"}}>{fr}</span><span style={{color:"#D4A843",fontWeight:700,width:80,textAlign:"center"}}>{pr}</span></div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <button onClick={onUpgrade} style={{flex:1,background:"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:12,padding:"14px",color:"#0A1A0F",fontWeight:800,fontSize:14,cursor:"pointer"}}>2 500 FCFA/mois</button>
            <button onClick={onUpgrade} style={{flex:1,background:"#1B4332",border:"1px solid #D4A843",borderRadius:12,padding:"14px",color:"#D4A843",fontWeight:800,fontSize:13,cursor:"pointer",lineHeight:1.4}}>25 000/an<br/><span style={{fontSize:10}}>(-17%)</span></button>
          </div>
          <div style={{background:"#0A1A0F",borderRadius:12,padding:12}}>
            <p style={{margin:"0 0 8px",color:"#6B7280",fontSize:11,fontWeight:700}}>PAYER VIA MOBILE MONEY :</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Orange Money</button>
              <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Wave</button>
            </div>
            <p style={{color:"#6B7280",fontSize:10,textAlign:"center",margin:"8px 0 0"}}>+223 76 90 80 31 (Orange) - +223 90 64 71 06 (Wave)</p>
          </div>
        </div>}
        <p style={{color:"#6B7280",fontSize:11,fontWeight:700,marginBottom:10,letterSpacing:.5}}>REGLAGES</p>
        {[...(user.role==="admin"?[{ic:"🛡️",lb:t("panneauAdmin"),fn:onOpenAdmin}]:[]),{ic:"🔔",lb:notifBusy?"...":t("notifications"),fn:enableNotifications},{ic:"📲",lb:t("lierWA"),fn:()=>window.open("https://wa.me/22376908031","_blank")},{ic:"🔒",lb:t("changerPin"),fn:()=>onToast("Bientot disponible")},{ic:"📤",lb:t("exporterDonnees"),fn:()=>onToast("Export en cours...")},{ic:"💬",lb:t("contacterSupport"),fn:()=>setShowSupport(true)}].map(item=>(
          <div key={item.lb} onClick={item.fn} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"#0F2419",borderRadius:14,marginBottom:8,cursor:"pointer",border:"1px solid #1B4332"}}>
            <span style={{fontSize:20}}>{item.ic}</span><p style={{margin:0,color:"#FDF6EC",fontSize:14,fontWeight:600}}>{item.lb}</p><span style={{marginLeft:"auto",color:"#2D6A4F",fontSize:18}}>›</span>
          </div>
        ))}
        <div style={{marginTop:16}}>
          {!showOut
            ?<button onClick={()=>setShowOut(true)} style={{width:"100%",background:"transparent",border:"1px solid #C1440E",borderRadius:14,padding:"14px",color:"#EF4444",fontWeight:700,fontSize:15,cursor:"pointer"}}>{t("deconnexion")}</button>
            :<div style={{background:"#1A0800",border:"1px solid #C1440E",borderRadius:14,padding:16}}><p style={{color:"#FDF6EC",fontWeight:700,margin:"0 0 14px",textAlign:"center"}}>Confirmer la deconnexion ?</p><div style={{display:"flex",gap:10}}><button onClick={()=>setShowOut(false)} style={{flex:1,background:"#1B4332",border:"none",borderRadius:12,padding:12,color:"#FDF6EC",fontWeight:700,cursor:"pointer"}}>Annuler</button><button onClick={onLogout} style={{flex:1,background:"#C1440E",border:"none",borderRadius:12,padding:12,color:"#fff",fontWeight:700,cursor:"pointer"}}>Deconnecter</button></div></div>}
        </div>
        <p style={{color:"#2D6A4F",fontSize:11,textAlign:"center",margin:"20px 0 10px"}}>HABY Tontine v2.1 - Fait avec amour pour l Afrique</p>
      </div>
      {showSupport&&<SupportModal onClose={()=>setShowSupport(false)} onToast={onToast}/>}
    </div>
  );
};

const ModalCreer = ({onClose,onCreate,user}) => {
  const [nom,setNom]=useState("");
  const [montant,setMontant]=useState("");
  const [freq,setFreq]=useState("Mensuel");
  const [echeance,setEcheance]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const handle=async()=>{
    if(!nom.trim())return setErr("Donne un nom a ta tontine");
    if(!montant||Number(montant)<500)return setErr("Montant minimum : 500 FCFA");
    if(user.plan==="free"&&user.groupesCount>=3)return setErr("Plan gratuit limite a 3 tontines. Passe a Premium !");
    setBusy(true);
    const payload={user_id:user.id,owner_id:user.id,nom:s(nom.trim()),montant:Number(montant),frequence:freq,couleur:"#D4A843",cycle:1,total_cycles:12,date_echeance:echeance||new Date(Date.now()+30*86400000).toISOString().split("T")[0],caisse_sociale:0};
    const {data,error}=await supabase.from("groupes").insert(payload).select().single();
    setBusy(false);
    if(error)return setErr("Erreur technique : "+(error.message||"inconnue"));
    onCreate({id:data.id,nom:data.nom,montant:Number(data.montant),frequence:data.frequence,couleur:data.couleur,cycle:data.cycle,totalCycles:data.total_cycles,dateEcheance:data.date_echeance,caisseSociale:0,cagnotte:0,prochainTour:"-",membres:[],checklist:[],messages:[]});
    onClose();
  };
  return <Modal onClose={onClose}>
    <MH title="Nouvelle Tontine" onClose={onClose}/>
    <Fld label="Nom de la tontine"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Tontine des Mamans" maxLength={40} autoFocus/></Fld>
    <Fld label="Montant par cotisation (FCFA)"><Inp value={montant} onChange={e=>setMontant(e.target.value.replace(/\D/g,""))} placeholder="Ex: 25000" inputMode="numeric"/></Fld>
    <Fld label="Date d echeance mensuelle"><Inp value={echeance} onChange={e=>setEcheance(e.target.value)} placeholder="Ex: 2026-07-01" type="date"/></Fld>
    <Fld label="Frequence"><div style={{display:"flex",gap:8}}>{["Hebdo","Bimensuel","Mensuel"].map(f=><button key={f} onClick={()=>setFreq(f)} style={{flex:1,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:freq===f?"#D4A843":"#1B4332",color:freq===f?"#0A1A0F":"#FDF6EC",borderColor:freq===f?"#D4A843":"#2D6A4F"}}>{f}</button>)}</div></Fld>
    <ErrBox msg={err}/>
    <Btn onClick={handle} disabled={busy}>{busy?"Creation...":"Creer ma tontine"}</Btn>
  </Modal>;
};

export default function App() {
  const [user,setUser]=useState(null);
  const [checking,setChecking]=useState(true);
  const [nav,setNav]=useState("home");
  const [groupes,setGroupes]=useState([]);
  const [sel,setSel]=useState(null);
  const [toast,setToast]=useState(null);
  const [showC,setShowC]=useState(false);
  const [lang,setLang]=useState("fr");
  const [participations,setParticipations]=useState([]);
  const [selPart,setSelPart]=useState(null);

  const showToast=useCallback((msg,type)=>setToast({msg,type}),[]);

  const changeLang=useCallback(async(l)=>{
    setAppLang(l);setLang(l);
    if(user)await supabase.from("users").update({langue:l}).eq("id",user.id);
  },[user]);

  const loadParticipations=useCallback(async(uid)=>{
    const {data:mine,error}=await supabase.from("membres").select("*").eq("user_id",uid);
    if(error||!mine||mine.length===0){setParticipations([]);return;}
    const groupeIds=[...new Set(mine.map(m=>m.groupe_id))];
    const {data:gs}=await supabase.from("groupes").select("*").in("id",groupeIds);
    const full=await Promise.all((gs||[]).map(async g=>{
      const {data:membres}=await supabase.from("membres").select("*").eq("groupe_id",g.id).order("ordre",{ascending:true});
      const moi=mine.find(m=>m.groupe_id===g.id);
      return {
        id:g.id,nom:g.nom,montant:Number(g.montant)||0,frequence:g.frequence||"Mensuel",couleur:g.couleur||"#D4A843",
        cycle:g.cycle||1,totalCycles:g.total_cycles||12,
        membres:(membres||[]).map(m=>({id:m.id,prenom:m.prenom,paye:m.paye,quartier:m.quartier,photo:m.photo_url,evenement:m.evenement})),
        moi:moi?{versements:Number(moi.versements)||0,paye:moi.paye,cyclesPaies:moi.cycles_paies||0}:null,
      };
    }));
    setParticipations(full);
  },[]);

  const loadGroupes=useCallback(async(uid)=>{
    const {data:gs,error}=await supabase.from("groupes").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(error){showToast("Erreur de chargement des tontines","error");return;}
    const full=await Promise.all((gs||[]).map(async g=>{
      const {data:membres}=await supabase.from("membres").select("*").eq("groupe_id",g.id).order("ordre",{ascending:true});
      const {data:checklist}=await supabase.from("checklist").select("*").eq("groupe_id",g.id).order("created_at",{ascending:true});
      const mm=(membres||[]).map(m=>({id:m.id,prenom:m.prenom,tel:m.tel,quartier:m.quartier,photo:m.photo_url,paye:m.paye,evenement:m.evenement,score:m.score??80,versements:Number(m.versements)||0,cyclesPaies:m.cycles_paies||0,cyclesTotal:(g.total_cycles||12)-(g.cycle||1)+1}));
      const aJourCount=mm.filter(m=>m.paye).length;
      return {
        id:g.id,nom:g.nom,montant:Number(g.montant)||0,frequence:g.frequence||"Mensuel",couleur:g.couleur||"#D4A843",
        cycle:g.cycle||1,totalCycles:g.total_cycles||12,dateEcheance:g.date_echeance,
        caisseSociale:Number(g.caisse_sociale)||0,cagnotte:aJourCount*(Number(g.montant)||0),
        prochainTour:(mm.find(m=>!m.paye)||mm[0])?.prenom||"-",
        membres:mm,
        checklist:(checklist||[]).map(c=>({id:c.id,label:c.label,done:c.done})),
        messages:[],
      };
    }));
    setGroupes(full);
  },[showToast]);

  useEffect(()=>{
    (async()=>{
      const sessionUser=await getSession();
      if(sessionUser){setUser(sessionUser);setAppLang(sessionUser.langue||"fr");setLang(sessionUser.langue||"fr");await loadGroupes(sessionUser.id);await loadParticipations(sessionUser.id);}
      setChecking(false);
    })();
  },[]);

  const handleLogout=async()=>{
    await logoutUser();
    setUser(null);setNav("home");setSel(null);
  };

  if(checking){
    return <div style={{minHeight:"100vh",background:"#0A1A0F",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:60,height:60,background:"linear-gradient(135deg,#D4A843,#E8B96A)",borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:900,color:"#0A1A0F"}}>H</div>
    </div>;
  }

  if(!user)return <AuthScreen onLogin={async(u)=>{setUser(u);setAppLang(u.langue||"fr");setLang(u.langue||"fr");await loadGroupes(u.id);await loadParticipations(u.id);}}/>;
  const cu={...user,groupesCount:groupes.length};
  const NAV=[["home","🏠",t("accueil")],["epargne","🏺",t("epargne")],["haby","🤖","HABY"],["profil","👤",t("profil")]];

  return(
    <div style={{background:"#0A1A0F",minHeight:"100vh",maxWidth:440,margin:"0 auto",position:"relative",display:"flex",flexDirection:"column"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');*{box-sizing:border-box;font-family:'Plus Jakarta Sans',sans-serif;}::-webkit-scrollbar{width:0;height:0;}input{-webkit-appearance:none;}input::placeholder{color:#2D6A4F;}`}</style>
      <div style={{flex:1,overflowY:"auto",paddingBottom:nav==="haby"?0:72}}>
        {selPart?<ParticipationScreen groupe={selPart} onBack={()=>setSelPart(null)}/>
        :sel?<GroupeScreen groupe={sel} onBack={()=>{setSel(null);loadGroupes(cu.id);}} onToast={showToast} user={cu} onDeleteGroupe={(gid)=>{setGroupes(gs=>gs.filter(g=>g.id!==gid));setSel(null);}} onUpdateGroupe={(gid,upd)=>{setGroupes(gs=>gs.map(g=>g.id===gid?{...g,...upd}:g));setSel(s=>s&&s.id===gid?{...s,...upd}:s);}}/>
        :nav==="home"?<HomeScreen user={cu} groupes={groupes} onSelectGroupe={setSel} onCreer={()=>setShowC(true)} onProfil={()=>setNav("profil")} participations={participations} onSelectParticipation={setSelPart}/>
        :nav==="epargne"?<EpargneScreen onToast={showToast} user={cu}/>
        :nav==="haby"?<HabyScreen groupes={groupes}/>
        :nav==="admin"?<AdminScreen onBack={()=>setNav("profil")} onToast={showToast} currentUserId={cu.id}/>
        :nav==="profil"?<ProfilScreen user={cu} onLogout={handleLogout} onToast={showToast} onUpgrade={()=>showToast("Envoie ton paiement et contacte le support WhatsApp","warn")} onOpenAdmin={()=>setNav("admin")} lang={lang} onChangeLang={changeLang}/>:null}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:440,background:"#0F2419",borderTop:"1px solid #1B4332",display:"flex",padding:"8px 0 20px",zIndex:100}}>
        {NAV.map(([id,icon,lbl])=><button key={id} onClick={()=>{setSel(null);setNav(id);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",color:nav===id&&!sel?"#D4A843":"#6B7280",cursor:"pointer",padding:"4px 0",gap:3}}><span style={{fontSize:22}}>{icon}</span><span style={{fontSize:10,fontWeight:600}}>{lbl}</span></button>)}
      </div>
      {showC&&<ModalCreer onClose={()=>setShowC(false)} onCreate={g=>{setGroupes(p=>[...p,g]);showToast("Tontine creee !");}} user={cu}/>}
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}
