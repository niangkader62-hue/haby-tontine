import { useState, useEffect, useRef, useCallback } from "react";
import { registerUser, loginUser, getSession, logoutUser, verifyPin } from "./authService";
import { supabase } from "./supabaseClient";
import { jsPDF } from "jspdf";

const s = (str) => String(str ?? "").replace(/[<>"'`]/g, "").slice(0, 300);
const sPhone = (p) => String(p).replace(/[^\d+\s]/g, "").slice(0, 16);
const sPin = (p) => String(p).replace(/\D/g, "").slice(0, 4);
const fmtFCFA = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";
const genId = () => Date.now() + Math.random().toString(36).slice(2, 7);

const uploadPhoto = async (file, prefix) => {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
};

const uploadAudio = async (blob, groupeId) => {
  const path = `messages/${groupeId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.webm`;
  const { error } = await supabase.storage.from("audio").upload(path, blob, { upsert: true, contentType: "audio/webm" });
  if (error) throw error;
  const { data } = supabase.storage.from("audio").getPublicUrl(path);
  return data.publicUrl;
};

const notifyMessage = (recipientIds, senderName, isAudio, url) => {
  const title = "HABY Tontine - Nouveau message";
  const body = isAudio ? `${senderName} t'a envoye un message vocal` : `${senderName} : nouveau message`;
  [...new Set((recipientIds||[]).filter(Boolean))].forEach(uid=>{
    supabase.functions.invoke("send-push",{body:{user_id:uid,title,body,url:url||"/"}}).catch(()=>{});
  });
};

function useAudioRecorder(){
  const [recording,setRecording]=useState(false);
  const mediaRef=useRef(null);
  const chunksRef=useRef([]);
  const start=async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mr=new MediaRecorder(stream);
      chunksRef.current=[];
      mr.ondataavailable=(e)=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      mr.start();
      mediaRef.current=mr;
      setRecording(true);
      return true;
    }catch{ return false; }
  };
  const stop=()=>new Promise((resolve)=>{
    const mr=mediaRef.current;
    if(!mr){resolve(null);return;}
    mr.onstop=()=>{
      const blob=new Blob(chunksRef.current,{type:"audio/webm"});
      mr.stream.getTracks().forEach((t)=>t.stop());
      setRecording(false);
      resolve(blob);
    };
    mr.stop();
  });
  return {recording,start,stop};
}

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
    tabMembres:"Membres",tabBureau:"Bureau",tabTirage:"Tirage",tabPrets:"Prets",tabReunions:"Reunions",
    tabEvenements:"Evenements",tabTaches:"Taches",tabSocial:"Message",tabRapport:"Rapport",
    mesCagnottes:"Mes Cagnottes",lectureSeule:"Lecture seule",maSituation:"Ma situation",
    statut:"Statut",aJour:"A jour",enRetard:"En retard",membresGroupe:"Membres du groupe",
    ecrisAHaby:"Ecris a HABY...",panneauUtilisatrices:"Utilisatrices inscrites",
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
    tabMembres:"Members",tabBureau:"Board",tabTirage:"Draw",tabPrets:"Loans",tabReunions:"Meetings",
    tabEvenements:"Events",tabTaches:"Tasks",tabSocial:"Message",tabRapport:"Report",
    mesCagnottes:"My Fundraisers",lectureSeule:"Read only",maSituation:"My situation",
    statut:"Status",aJour:"Up to date",enRetard:"Late",membresGroupe:"Group members",
    ecrisAHaby:"Write to HABY...",panneauUtilisatrices:"Registered users",
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
    tabMembres:"الأعضاء",tabBureau:"المكتب",tabTirage:"القرعة",tabPrets:"القروض",tabReunions:"الاجتماعات",
    tabEvenements:"الأحداث",tabTaches:"المهام",tabSocial:"رسالة",tabRapport:"التقرير",
    mesCagnottes:"صناديقي",lectureSeule:"قراءة فقط",maSituation:"وضعيتي",
    statut:"الحالة",aJour:"محدث",enRetard:"متأخر",membresGroupe:"أعضاء المجموعة",
    ecrisAHaby:"اكتبي لهابي...",panneauUtilisatrices:"المستخدمات المسجلات",
  },
  bm:{
    connexion:"Login",inscription:"I tɔgɔ sɛbɛn",bienvenue:"I bisimila",
    accueil:"So kɔnɔ",epargne:"Mara",profil:"I ka kunnafoni",
    mesTontines:"N ka tontinw",creer:"Dilan",ajouter:"Fara a kan",modifier:"Yɛlɛma",supprimer:"Bɔ a la",
    enregistrer:"Mara",annuler:"Dabila",gratuit:"FU",premium:"PREMIUM",
    notifications:"Kunnafoniw daminɛ",lierWA:"WhatsApp sirilen",changerPin:"N ka gundo yɛlɛma",
    exporterDonnees:"N ka kunnafoniw bɔ",contacterSupport:"Dɛmɛbaga wele",deconnexion:"Bɔ",
    panneauAdmin:"Kuntigiya yɔrɔ",langue:"Kan",
    mesEpargnes:"N ka mara",caisseSociale:"Jama ka wari",
    membresEnRetard:"tɔnden(w) tɔnɔlen",cliquezTontine:"I bolo tontine kan",
    tabMembres:"Tɔndenw",tabBureau:"Ka biro",tabTirage:"Filɛli",tabPrets:"Juruw",tabReunions:"Lajɛw",
    tabEvenements:"Kow",tabTaches:"Baaraw",tabSocial:"Bataki",tabRapport:"Kunnafoni",
    mesCagnottes:"N ka waribɔlanw",lectureSeule:"Kalanni dɔrɔn",maSituation:"N ka cogoya",
    statut:"Cogoya",aJour:"A bɛnnen",enRetard:"A tɔnɔlen",membresGroupe:"Jɛkulu tɔndenw",
    ecrisAHaby:"HABY ye sɛbɛn...",panneauUtilisatrices:"Baarakɛlaw tɔgɔsɛbɛnnen",
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
  const [photoFile,setPhotoFile]=useState(null);
  const [parrainCode,setParrainCode]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const fileRef=useRef();

  const handlePhoto=(e)=>{const f=e.target.files?.[0];if(!f)return;if(f.size>4*1024*1024)return setErr("Photo max 4MB");setPhotoFile(f);const r=new FileReader();r.onload=(ev)=>setPhoto(ev.target.result);r.readAsDataURL(f);};
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
    const res=await registerUser(tel,pin,s(prenom.trim()),photoFile,parrainCode);
    setLoading(false);
    if(!res.ok)return setErr(res.err);
    onLogin(res.user);
  };

  const W={minHeight:"100vh",background:"linear-gradient(160deg,#050F07,#1B4332)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,overflowY:"auto"};
  const C={background:"#0F2419",borderRadius:24,padding:"28px 24px",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.6)"};

  if(step==="welcome") return(
    <div style={W}><div style={C}>
      <div style={{textAlign:"center",paddingBottom:8}}>
        <div style={{width:120,height:120,borderRadius:32,margin:"0 auto 18px",background:"linear-gradient(135deg,#D4A843,#E8B96A)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(212,168,67,0.3)"}}>
          <span style={{fontSize:56,fontWeight:900,color:"#0A1A0F"}}>H</span>
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
      <Fld label="Code de parrainage (optionnel)"><Inp value={parrainCode} onChange={e=>setParrainCode(e.target.value.toUpperCase())} placeholder="Ex: A1B2C3D4" maxLength={12}/></Fld>
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

const HomeScreen = ({user,groupes,onSelectGroupe,onCreer,onProfil,participations,onSelectParticipation,cagnottes,onCreerCagnotte,onSelectCagnotte}) => {
  const totalEp=groupes.reduce((a,g)=>a+g.cagnotte,0);
  const totalCS=groupes.reduce((a,g)=>a+g.caisseSociale,0);
  const nbRet=groupes.reduce((a,g)=>a+g.membres.filter(m=>!m.paye).length,0);
  return(
    <div style={{paddingBottom:90}}>
      <div style={{background:"linear-gradient(135deg,#0F2419,#1B4332)",padding:"48px 20px 36px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <p style={{color:"#D4A843",fontSize:13,margin:0,fontWeight:600}}>{t("bienvenue")}</p>
          <h2 style={{color:"#FDF6EC",margin:"2px 0 0",fontSize:24,fontWeight:900}}>{user.prenom}</h2>
          <span style={{background:user.plan==="premium"?"#D4A843":"#1B4332",color:user.plan==="premium"?"#0A1A0F":"#D4A843",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,marginTop:4,display:"inline-block"}}>
            {user.plan==="premium"?"PREMIUM":`GRATUIT - ${groupes.length}/1 tontine`}
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
      <div style={{padding:"22px 16px 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{color:"#FDF6EC",fontSize:16,fontWeight:800,margin:0}}>{t("mesCagnottes")}</h3>
          <button onClick={onCreerCagnotte} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 16px",color:"#D4A843",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Creer</button>
        </div>
        {(!cagnottes||cagnottes.length===0)?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",padding:"10px 0"}}>Aucune cagnotte pour le moment (mariage, sante, funerailles, etudes...)</p>
        :cagnottes.map(c=>{const pct=Math.min(100,Math.round((c.montant_collecte/c.objectif)*100));return(
          <div key={c.id} onClick={()=>onSelectCagnotte(c)} style={{background:"#0F2419",borderRadius:16,padding:16,marginBottom:10,border:"1px solid #1B4332",cursor:"pointer"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p style={{margin:0,color:"#FDF6EC",fontWeight:800,fontSize:15}}>{c.titre}</p>
              <span style={{background:c.statut==="cloturee"?"#1B4332":"#D4A843",color:c.statut==="cloturee"?"#6B7280":"#0A1A0F",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{c.statut==="cloturee"?"Cloturee":"Ouverte"}</span>
            </div>
            <Bar pct={pct} c="#D4A843"/>
            <p style={{margin:"6px 0 0",color:"#6B7280",fontSize:12}}>{fmtFCFA(c.montant_collecte)} / {fmtFCFA(c.objectif)} ({pct}%)</p>
          </div>
        );})}
      </div>
    </div>
  );
};

const ParticipationScreen = ({groupe,onBack,user,onToast,onVoted,deepLink}) => {
  const pct=Math.round((groupe.cycle/groupe.totalCycles)*100);
  const [voting,setVoting]=useState(null);
  const [messages,setMessages]=useState([]);
  const [msgInput,setMsgInput]=useState("");
  const [thread,setThread]=useState(deepLink?.thread||null);
  const loadMessages=async()=>{
    let q=supabase.from("messages").select("*").eq("groupe_id",groupe.id);
    q=thread?q.or(`and(auteur_user_id.eq.${user.id},destinataire_user_id.eq.${thread.userId}),and(auteur_user_id.eq.${thread.userId},destinataire_user_id.eq.${user.id})`):q.is("destinataire_user_id",null);
    const {data}=await q.order("created_at",{ascending:true});
    setMessages((data||[]).map(m=>({id:m.id,auteur:m.auteur_nom,texte:m.texte,audioUrl:m.audio_url,time:new Date(m.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})})));
  };
  useEffect(()=>{loadMessages();},[groupe.id,thread]);
  const {recording,start:startRec,stop:stopRec}=useAudioRecorder();
  const [sendingAudio,setSendingAudio]=useState(false);
  const getRecipients=()=>thread?[thread.userId]:[groupe.createurUserId,...groupe.membres.map(m=>m.userId)].filter(uid=>uid&&uid!==user.id);
  const getDeepLink=()=>`/?g=${groupe.id}&tab=social`+(thread?`&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`:"");
  const sendMsg=async()=>{
    if(!msgInput.trim())return;
    const texte=s(msgInput.trim());
    setMsgInput("");
    const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte,destinataire_user_id:thread?.userId||null}).select().single();
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:data.texte,time:"maintenant"}]);
    notifyMessage(getRecipients(),user.prenom,false,getDeepLink());
    onToast("Message envoye !");
  };
  const toggleRecord=async()=>{
    if(recording){
      const blob=await stopRec();
      if(!blob||blob.size<500)return;
      setSendingAudio(true);
      try{
        const audioUrl=await uploadAudio(blob,groupe.id);
        const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",audio_url:audioUrl,destinataire_user_id:thread?.userId||null}).select().single();
        if(error)throw error;
        setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:"",audioUrl:data.audio_url,time:"maintenant"}]);
        notifyMessage(getRecipients(),user.prenom,true,getDeepLink());
        onToast("Message vocal envoye !");
      }catch{onToast("Envoi du message vocal impossible","error");}
      setSendingAudio(false);
    }else{
      const ok=await startRec();
      if(!ok)onToast("Micro indisponible ou refuse","error");
    }
  };
  const voter=async(election,candidateId)=>{
    setVoting(election.id);
    const {error}=await supabase.from("votes").insert({election_id:election.id,voter_user_id:user.id,candidate_membre_id:candidateId});
    setVoting(null);
    if(error)return onToast("Vote impossible (peut-etre deja vote ?)","error");
    onToast("Vote enregistre !");
    onVoted&&onVoted();
  };
  const ROLES_LABELS={president:"Presidente",tresoriere:"Tresoriere",secretaire:"Secretaire"};
  return(
    <div style={{paddingBottom:90}}>
      <div style={{padding:"44px 16px 0",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#D4A843",fontSize:22,cursor:"pointer"}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#FDF6EC",margin:0,fontSize:17,fontWeight:800}}>{groupe.nom}</h2><p style={{color:"#D4A843",margin:0,fontSize:12}}>{groupe.frequence} - {fmtFCFA(groupe.montant)}/cotisation</p></div>
        <span style={{background:"#1B4332",color:"#6B7280",fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:99}}>{t("lectureSeule")}</span>
      </div>
      <div style={{padding:"16px 16px 0"}}>
        <Bar pct={pct} c={groupe.couleur}/>
        <p style={{color:"#6B7280",fontSize:12,margin:"6px 0 0"}}>Cycle {groupe.cycle}/{groupe.totalCycles}</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"16px 16px 0"}}>
        <div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:14}}>
          <p style={{margin:0,color:"#6B7280",fontSize:11,fontWeight:600}}>CAGNOTTE DU CYCLE</p>
          <p style={{margin:"4px 0 0",color:"#D4A843",fontSize:18,fontWeight:900}}>{fmtFCFA(groupe.cagnotte)}</p>
        </div>
        <div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:14}}>
          <p style={{margin:0,color:"#6B7280",fontSize:11,fontWeight:600}}>CAISSE SOCIALE</p>
          <p style={{margin:"4px 0 0",color:"#D4A843",fontSize:18,fontWeight:900}}>{fmtFCFA(groupe.caisseSociale)}</p>
        </div>
      </div>
      {groupe.moi&&<div style={{margin:"16px 16px 0",background:"#0F2419",border:"1px solid #D4A843",borderRadius:14,padding:16}}>
        <p style={{margin:0,color:"#D4A843",fontWeight:700,fontSize:13}}>{t("maSituation")}</p>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
          <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Statut</p><p style={{margin:"2px 0 0",color:groupe.moi.paye?"#22C55E":"#EF4444",fontWeight:800,fontSize:14}}>{groupe.moi.paye?"A jour":"En retard"}</p></div>
          <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Verse au total</p><p style={{margin:"2px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:14}}>{fmtFCFA(groupe.moi.versements)}</p></div>
          <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Cycles payes</p><p style={{margin:"2px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:14}}>{groupe.moi.cyclesPaies}/{groupe.totalCycles}</p></div>
        </div>
      </div>}
      <div style={{padding:"20px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>MEMBRES DU GROUPE ({groupe.membres.length})</p>
        {groupe.membres.map(m=>(
          <div key={m.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
            <Avatar prenom={m.prenom} photo={m.photo} size={38}/>
            <div style={{flex:1}}><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{m.prenom}</p><p style={{margin:"2px 0 0",color:"#6B7280",fontSize:11}}>Verse : {fmtFCFA(m.versements)}</p></div>
            <span style={{background:m.paye?"#1B4332":"#1A0800",color:m.paye?"#22C55E":"#EF4444",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{m.paye?"Paye":"En retard"}</span>
          </div>
        ))}
      </div>
      {groupe.membres.some(m=>m.role_bureau)&&<div style={{padding:"16px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>BUREAU</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {groupe.membres.filter(m=>m.role_bureau).map(m=>(
            <div key={m.id} style={{background:"#0F2419",border:"1px solid #D4A843",borderRadius:12,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
              <Avatar prenom={m.prenom} photo={m.photo} size={26}/>
              <div><p style={{margin:0,color:"#FDF6EC",fontSize:12,fontWeight:700}}>{m.prenom}</p><p style={{margin:0,color:"#D4A843",fontSize:10}}>{ROLES_LABELS[m.role_bureau]||m.role_bureau}</p></div>
            </div>
          ))}
        </div>
      </div>}
      {groupe.elections&&groupe.elections.length>0&&<div style={{padding:"16px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>ELECTIONS EN COURS</p>
        {groupe.elections.map(e=>(
          <div key={e.id} style={{background:"#0A1A0F",border:"1px solid #D4A843",borderRadius:14,padding:14,marginBottom:10}}>
            <p style={{margin:"0 0 10px",color:"#D4A843",fontWeight:700,fontSize:13}}>🗳️ {ROLES_LABELS[e.role]||e.role}</p>
            {e.dejaVote?<p style={{color:"#22C55E",fontSize:13,margin:0}}>✓ Tu as deja vote pour cette election</p>
            :e.candidats.map(cid=>{const c=groupe.membres.find(m=>m.id===cid);return(
              <button key={cid} onClick={()=>voter(e,cid)} disabled={voting===e.id} style={{width:"100%",display:"flex",alignItems:"center",gap:10,background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"10px 12px",marginBottom:6,cursor:"pointer"}}>
                <Avatar prenom={c?.prenom||"?"} photo={c?.photo} size={28}/><p style={{margin:0,color:"#FDF6EC",fontSize:13,fontWeight:600}}>{c?.prenom||"?"}</p>
              </button>
            );})}
          </div>
        ))}
      </div>}
      {groupe.reglement&&<div style={{padding:"16px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>REGLEMENT INTERIEUR</p>
        <div style={{background:"#0F2419",border:"1px solid #D4A843",borderRadius:14,padding:16}}>
          <p style={{margin:0,color:"#FDF6EC",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{groupe.reglement}</p>
        </div>
      </div>}
      {groupe.rapports&&groupe.rapports.length>0&&<div style={{padding:"16px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>COMPTES RENDUS DE REUNION</p>
        {groupe.rapports.map(r=>(
          <div key={r.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:16,marginBottom:10}}>
            <p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{r.titre}</p>
            <p style={{margin:"3px 0 0",color:"#D4A843",fontSize:11}}>{r.date_reunion?new Date(r.date_reunion).toLocaleDateString("fr-FR"):""}</p>
            {r.contenu&&<p style={{margin:"10px 0 0",color:"#6B7280",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{r.contenu}</p>}
          </div>
        ))}
      </div>}
      {groupe.prets&&groupe.prets.length>0&&<div style={{padding:"16px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>PRETS EN COURS</p>
        {groupe.prets.map(p=>{const m=groupe.membres.find(mm=>mm.id===p.membre_id);const total=p.montant*(1+p.taux_interet/100);const reste=total-p.montant_rembourse;return(
          <div key={p.id} style={{background:"#0F2419",border:`1px solid ${p.statut==="rembourse"?"#1B4332":"#D4A843"}`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Avatar prenom={m?.prenom||"?"} photo={m?.photo} size={30}/><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:13}}>{m?.prenom||"?"}</p></div>
              <span style={{background:p.statut==="rembourse"?"#1B4332":"#1A0800",color:p.statut==="rembourse"?"#22C55E":"#D4A843",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99}}>{p.statut==="rembourse"?"Rembourse":"En cours"}</span>
            </div>
            <p style={{margin:"8px 0 0",color:"#6B7280",fontSize:12}}>{fmtFCFA(p.montant)} emprunte - {fmtFCFA(Math.max(0,reste))} restant</p>
          </div>
        );})}
      </div>}
      {groupe.tirages&&groupe.tirages.length>0&&<div style={{padding:"8px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>HISTORIQUE DES TIRAGES AU SORT</p>
        {[...groupe.tirages].reverse().map(t=>{const m=groupe.membres.find(mm=>mm.id===t.membre_id);return(
          <div key={t.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{background:"#1B4332",color:"#D4A843",fontSize:11,fontWeight:800,padding:"3px 8px",borderRadius:8}}>Cycle {t.cycle}</span>
            <p style={{margin:0,color:"#FDF6EC",fontSize:13,fontWeight:700,flex:1}}>{m?.prenom||"Membre retire"}</p>
            <p style={{margin:0,color:"#6B7280",fontSize:11}}>{new Date(t.created_at).toLocaleDateString("fr-FR")}</p>
          </div>
        );})}
      </div>}
      {groupe.checklist&&groupe.checklist.length>0&&<div style={{padding:"8px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>TACHES DU GROUPE</p>
        {groupe.checklist.map(c=>(
          <div key={c.id} style={{background:"#0F2419",border:`1px solid ${c.done?"#D4A843":"#1B4332"}`,borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>
            <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${c.done?"#D4A843":"#2D6A4F"}`,background:c.done?"#D4A843":"transparent",flexShrink:0}}/>
            <p style={{margin:0,color:c.done?"#6B7280":"#FDF6EC",fontSize:13,textDecoration:c.done?"line-through":"none"}}>{c.label}</p>
          </div>
        ))}
      </div>}
      <div style={{padding:"20px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>MESSAGES</p>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:6}}>
          <button onClick={()=>setThread(null)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:!thread?"#D4A843":"#0F2419",border:"1px solid "+(!thread?"#D4A843":"#1B4332"),borderRadius:99,padding:"7px 14px",color:!thread?"#0A1A0F":"#FDF6EC",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>💬 Groupe</button>
          {groupe.createurUserId&&groupe.createurUserId!==user.id&&<button onClick={()=>setThread({userId:groupe.createurUserId,prenom:groupe.createurNom})} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:thread?.userId===groupe.createurUserId?"#D4A843":"#0F2419",border:"1px solid "+(thread?.userId===groupe.createurUserId?"#D4A843":"#1B4332"),borderRadius:99,padding:"6px 14px 6px 6px",color:thread?.userId===groupe.createurUserId?"#0A1A0F":"#FDF6EC",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}><Avatar prenom={groupe.createurNom} photo={groupe.createurPhoto} size={22}/>{groupe.createurNom} (creatrice)</button>}
          {groupe.membres.filter(m=>m.userId&&m.userId!==user.id).map(m=>(
            <button key={m.id} onClick={()=>setThread({userId:m.userId,prenom:m.prenom})} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:thread?.userId===m.userId?"#D4A843":"#0F2419",border:"1px solid "+(thread?.userId===m.userId?"#D4A843":"#1B4332"),borderRadius:99,padding:"6px 14px 6px 6px",color:thread?.userId===m.userId?"#0A1A0F":"#FDF6EC",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}><Avatar prenom={m.prenom} photo={m.photo} size={22}/>{m.prenom}</button>
          ))}
        </div>
        {thread&&<p style={{color:"#D4A843",fontSize:11,fontWeight:700,margin:"0 0 10px",textAlign:"center"}}>🔒 Conversation privee avec {thread.prenom}</p>}
        {messages.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",padding:10}}>Aucun message pour l instant</p>
        :messages.map(m=><div key={m.id} style={{display:"flex",gap:10,marginBottom:12}}><Avatar prenom={m.auteur} size={32}/><div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:"0 14px 14px 14px",padding:"8px 12px",flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><p style={{margin:0,color:"#D4A843",fontSize:11,fontWeight:700}}>{m.auteur}</p><p style={{margin:0,color:"#6B7280",fontSize:10}}>{m.time}</p></div>{m.audioUrl?<audio controls src={m.audioUrl} style={{width:"100%",height:34}}/>:<p style={{margin:0,color:"#FDF6EC",fontSize:13}}>{m.texte}</p>}</div></div>)}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={toggleRecord} disabled={sendingAudio} style={{background:recording?"#C1440E":"#1B4332",border:"1px solid #2D6A4F",borderRadius:12,width:44,height:44,color:recording?"#fff":"#D4A843",fontSize:18,cursor:"pointer",flexShrink:0}}>{sendingAudio?"⏳":recording?"⏹":"🎤"}</button>
          <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} placeholder={thread?`Message prive a ${thread.prenom}...`:"Ecrire au groupe..."} maxLength={200} onKeyDown={e=>e.key==="Enter"&&sendMsg()} style={{flex:1,background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 14px",color:"#FDF6EC",fontSize:14,outline:"none"}}/>
          <button onClick={sendMsg} style={{background:"#D4A843",border:"none",borderRadius:12,padding:"0 16px",color:"#0A1A0F",fontWeight:900,cursor:"pointer",fontSize:18}}>→</button>
        </div>
        {recording&&<p style={{color:"#C1440E",fontSize:11,margin:"6px 0 0",textAlign:"center"}}>🔴 Enregistrement en cours... clique sur ⏹ pour envoyer</p>}
      </div>
      <div style={{margin:"16px 16px 0",background:"#0A1A0F",border:"1px solid #2D6A4F",borderRadius:12,padding:12}}>
        <p style={{margin:0,color:"#6B7280",fontSize:11,lineHeight:1.6}}>ℹ️ Tu vois toutes les donnees de cette tontine en toute transparence, comme tous les autres membres. Seule la creatrice peut modifier les informations. Pour signaler un paiement, contacte-la directement.</p>
      </div>
    </div>
  );
};

const GroupeScreen = ({groupe:gInit,onBack,onToast,user,onDeleteGroupe,onUpdateGroupe,deepLink}) => {
  const [groupe,setGroupe]=useState(gInit);
  const [tab,setTab]=useState(deepLink?.tab||"membres");
  const [showMoreTabs,setShowMoreTabs]=useState(false);
  const [msgInput,setMsgInput]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [newM,setNewM]=useState({prenom:"",tel:"",quartier:"",photo:""});
  const [pickerBusy,setPickerBusy]=useState(false);
  const pickerBusyRef=useRef(false);
  const [payBusy,setPayBusy]=useState(false);
  const [showUpgrade,setShowUpgrade]=useState(false);
  const [showVers,setShowVers]=useState(false);
  const [versM,setVersM]=useState(null);
  const [versAmt,setVersAmt]=useState("");
  const [showHisto,setShowHisto]=useState(false);
  const [histoM,setHistoM]=useState(null);
  const [newTask,setNewTask]=useState("");
  const [evtM,setEvtM]=useState(null);
  const [evtTxt,setEvtTxt]=useState("");
  const [showEdit,setShowEdit]=useState(false);
  const [editG,setEditG]=useState({nom:gInit.nom,montant:String(gInit.montant),frequence:gInit.frequence,dateEcheance:gInit.dateEcheance||""});
  const [editBusy,setEditBusy]=useState(false);
  const [tirages,setTirages]=useState([]);
  const [tirageAnim,setTirageAnim]=useState(false);
  const [tirageBusy,setTirageBusy]=useState(false);
  const [elections,setElections]=useState([]);
  const [votes,setVotes]=useState([]);
  const [showElection,setShowElection]=useState(false);
  const [electionRole,setElectionRole]=useState("president");
  const [electionCands,setElectionCands]=useState([]);
  const [electionBusy,setElectionBusy]=useState(false);
  const [prets,setPrets]=useState([]);
  const [showPret,setShowPret]=useState(false);
  const [newPret,setNewPret]=useState({membreId:"",montant:"",taux:"0",echeance:""});
  const [pretBusy,setPretBusy]=useState(false);
  const [remboM,setRemboM]=useState(null);
  const [remboAmt,setRemboAmt]=useState("");
  const [rapports,setRapports]=useState([]);
  const [showRapport,setShowRapport]=useState(false);
  const [newRapport,setNewRapport]=useState({titre:"",contenu:"",date:""});
  const [rapportBusy,setRapportBusy]=useState(false);
  const [editReglement,setEditReglement]=useState(false);
  const [reglementTxt,setReglementTxt]=useState(gInit.reglement||"");
  const [reglementBusy,setReglementBusy]=useState(false);

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
    const {error}=await supabase.from("groupes").update({nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence,date_echeance:editG.dateEcheance||null}).eq("id",groupe.id);
    setEditBusy(false);
    if(error)return onToast("Modification impossible","error");
    setGroupe(g=>({...g,nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence,dateEcheance:editG.dateEcheance||null}));
    onUpdateGroupe(groupe.id,{nom:s(editG.nom.trim()),montant:Number(editG.montant),frequence:editG.frequence,dateEcheance:editG.dateEcheance||null});
    setShowEdit(false);onToast("Tontine modifiee !");
  };

  const loadTirages=async()=>{
    const {data}=await supabase.from("tirages").select("*").eq("groupe_id",groupe.id).order("cycle",{ascending:true});
    setTirages(data||[]);
  };
  const loadElections=async()=>{
    const {data:els}=await supabase.from("elections").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false});
    setElections(els||[]);
    const openIds=(els||[]).filter(e=>e.statut==="ouverte").map(e=>e.id);
    if(openIds.length>0){
      const {data:vs}=await supabase.from("votes").select("*").in("election_id",openIds);
      setVotes(vs||[]);
    }else setVotes([]);
  };
  useEffect(()=>{loadTirages();loadElections();},[groupe.id]);

  const dejaGagnants=new Set(tirages.map(t=>t.membre_id));
  const eligibles=groupe.membres.filter(m=>!dejaGagnants.has(m.id));
  const gagnantCycleActuel=tirages.find(t=>t.cycle===groupe.cycle);

  const lancerTirage=async()=>{
    if(eligibles.length===0)return onToast("Tout le monde a deja recu la cagnotte dans cette rotation","error");
    if(gagnantCycleActuel)return onToast("Le tirage a deja ete fait pour ce cycle","error");
    setTirageBusy(true);setTirageAnim(true);
    await new Promise(r=>setTimeout(r,1800));
    const gagnant=eligibles[Math.floor(Math.random()*eligibles.length)];
    const {data,error}=await supabase.from("tirages").insert({groupe_id:groupe.id,membre_id:gagnant.id,cycle:groupe.cycle}).select().single();
    setTirageBusy(false);
    if(error){setTirageAnim(false);return onToast("Tirage impossible","error");}
    setTirages(t=>[...t,data]);
    onToast(`${gagnant.prenom} remporte la cagnotte de ce cycle !`);
    setTimeout(()=>setTirageAnim(false),2500);
  };

  const ROLES=[["president","Presidente"],["tresoriere","Tresoriere"],["secretaire","Secretaire"]];
  const titulaire=(role)=>groupe.membres.find(m=>m.role_bureau===role);
  const electionActive=(role)=>elections.find(e=>e.role===role&&e.statut==="ouverte");

  const assignerDirect=async(role,membreId)=>{
    await supabase.from("membres").update({role_bureau:null}).eq("groupe_id",groupe.id).eq("role_bureau",role);
    if(membreId)await supabase.from("membres").update({role_bureau:role}).eq("id",membreId);
    setGroupe(g=>({...g,membres:g.membres.map(m=>({...m,role_bureau:m.id===membreId?role:(m.role_bureau===role?null:m.role_bureau)}))}));
    onToast("Bureau mis a jour !");
  };

  const lancerElection=async()=>{
    if(electionCands.length<2)return onToast("Choisis au moins 2 candidat(e)s","error");
    setElectionBusy(true);
    const {data,error}=await supabase.from("elections").insert({groupe_id:groupe.id,role:electionRole,candidats:electionCands}).select().single();
    setElectionBusy(false);
    if(error)return onToast("Impossible de lancer l election","error");
    setElections(e=>[data,...e]);
    setShowElection(false);setElectionCands([]);
    onToast("Election lancee ! Les membres lies peuvent voter.");
  };

  const cloturerElection=async(election)=>{
    const tally={};
    votes.filter(v=>v.election_id===election.id).forEach(v=>{tally[v.candidate_membre_id]=(tally[v.candidate_membre_id]||0)+1;});
    const winnerId=Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    if(!winnerId)return onToast("Aucun vote enregistre pour l instant","error");
    await supabase.from("elections").update({statut:"clotturee"}).eq("id",election.id);
    await assignerDirect(election.role,winnerId);
    setElections(es=>es.map(e=>e.id===election.id?{...e,statut:"clotturee"}:e));
    onToast("Election clôturee, le bureau est mis a jour !");
  };

  const loadPrets=async()=>{
    const {data}=await supabase.from("prets").select("*").eq("groupe_id",groupe.id).order("created_at",{ascending:false});
    setPrets(data||[]);
  };
  useEffect(()=>{loadPrets();},[groupe.id]);

  const loadRapports=async()=>{
    const {data}=await supabase.from("rapports_reunion").select("*").eq("groupe_id",groupe.id).order("date_reunion",{ascending:false});
    setRapports(data||[]);
  };
  useEffect(()=>{loadRapports();},[groupe.id]);

  const creerRapport=async()=>{
    if(!newRapport.titre.trim())return onToast("Donne un titre au rapport","error");
    setRapportBusy(true);
    const {data,error}=await supabase.from("rapports_reunion").insert({groupe_id:groupe.id,titre:s(newRapport.titre.trim()),contenu:s(newRapport.contenu||""),date_reunion:newRapport.date||new Date().toISOString().split("T")[0]}).select().single();
    setRapportBusy(false);
    if(error)return onToast("Impossible d enregistrer le rapport","error");
    setRapports(r=>[data,...r]);
    setShowRapport(false);setNewRapport({titre:"",contenu:"",date:""});
    onToast("Rapport de reunion enregistre !");
  };

  const supprimerRapport=async(id)=>{
    const {error}=await supabase.from("rapports_reunion").delete().eq("id",id);
    if(error)return onToast("Suppression impossible","error");
    setRapports(r=>r.filter(x=>x.id!==id));
    onToast("Rapport supprime");
  };

  const enregistrerReglement=async()=>{
    setReglementBusy(true);
    const {error}=await supabase.from("groupes").update({reglement:reglementTxt}).eq("id",groupe.id);
    setReglementBusy(false);
    if(error)return onToast("Enregistrement impossible","error");
    setGroupe(g=>({...g,reglement:reglementTxt}));
    onUpdateGroupe(groupe.id,{reglement:reglementTxt});
    setEditReglement(false);
    onToast("Reglement interieur enregistre !");
  };

  const creerPret=async()=>{
    if(!newPret.membreId)return onToast("Choisis un membre emprunteur","error");
    if(!newPret.montant||Number(newPret.montant)<500)return onToast("Montant minimum 500 FCFA","error");
    setPretBusy(true);
    const {data,error}=await supabase.from("prets").insert({groupe_id:groupe.id,membre_id:newPret.membreId,montant:Number(newPret.montant),taux_interet:Number(newPret.taux)||0,date_echeance:newPret.echeance||null}).select().single();
    setPretBusy(false);
    if(error)return onToast("Impossible de creer le pret","error");
    setPrets(p=>[data,...p]);
    setShowPret(false);setNewPret({membreId:"",montant:"",taux:"0",echeance:""});
    onToast("Pret enregistre !");
  };

  const rembourserPret=async()=>{
    const amt=Number(remboAmt);
    if(!amt||amt<1)return;
    const total=remboM.montant*(1+remboM.taux_interet/100);
    const nouveauRembourse=remboM.montant_rembourse+amt;
    const statut=nouveauRembourse>=total?"rembourse":"en_cours";
    const {error}=await supabase.from("prets").update({montant_rembourse:nouveauRembourse,statut}).eq("id",remboM.id);
    if(error)return onToast("Remboursement impossible","error");
    setPrets(ps=>ps.map(p=>p.id===remboM.id?{...p,montant_rembourse:nouveauRembourse,statut}:p));
    onToast(statut==="rembourse"?"Pret entierement rembourse !":"Remboursement enregistre !");
    setRemboM(null);setRemboAmt("");
  };

  const aJour=groupe.membres.filter(m=>m.paye);
  const enRet=groupe.membres.filter(m=>!m.paye);
  const collecte=aJour.length*groupe.montant;
  const cagnotteTour=groupe.membres.length*groupe.montant;
  const taux=groupe.membres.length>0?Math.round((aJour.length/groupe.membres.length)*100):0;

  const exporterRapportPDF=()=>{
    const doc=new jsPDF();
    let y=20;
    doc.setFontSize(18);doc.text(`HABY Tontine - ${groupe.nom}`,14,y);y+=10;
    doc.setFontSize(11);doc.text(`Genere le ${new Date().toLocaleDateString("fr-FR")}`,14,y);y+=12;
    doc.setFontSize(13);doc.text(`Bilan - Cycle ${groupe.cycle}/${groupe.totalCycles}`,14,y);y+=8;
    doc.setFontSize(10);
    [["Total collecte ce cycle",fmtFCFA(collecte)],["Cagnotte du tour",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux de ponctualite",`${taux}%`],["Membres a jour",`${aJour.length}/${groupe.membres.length}`],["Prochain tour",groupe.prochainTour],["Cycles restants",String(groupe.totalCycles-groupe.cycle)]].forEach(([l,v])=>{doc.text(`${l} : ${v}`,14,y);y+=7;});
    y+=6;
    doc.setFontSize(13);doc.text("Suivi par membre",14,y);y+=8;
    doc.setFontSize(10);
    groupe.membres.forEach(m=>{doc.text(`${m.prenom} - ${fmtFCFA(m.cyclesPaies*groupe.montant)} verse (${m.cyclesPaies}/${m.cyclesTotal} cycles)`,14,y);y+=7;if(y>270){doc.addPage();y=20;}});
    doc.save(`rapport-${groupe.nom.replace(/[^a-z0-9]/gi,"_")}.pdf`);
    onToast("Rapport PDF telecharge !");
  };


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
  const [messages,setMessages]=useState([]);
  const [thread,setThread]=useState(deepLink?.thread||null);
  const loadMessages=async()=>{
    let q=supabase.from("messages").select("*").eq("groupe_id",groupe.id);
    q=thread?q.or(`and(auteur_user_id.eq.${user.id},destinataire_user_id.eq.${thread.userId}),and(auteur_user_id.eq.${thread.userId},destinataire_user_id.eq.${user.id})`):q.is("destinataire_user_id",null);
    const {data}=await q.order("created_at",{ascending:true});
    setMessages((data||[]).map(m=>({id:m.id,auteur:m.auteur_nom,texte:m.texte,audioUrl:m.audio_url,time:new Date(m.created_at).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})})));
  };
  useEffect(()=>{loadMessages();},[groupe.id,thread]);
  const {recording,start:startRec,stop:stopRec}=useAudioRecorder();
  const [sendingAudio,setSendingAudio]=useState(false);
  const getRecipients=()=>(thread?[thread.userId]:groupe.membres.map(m=>m.userId)).filter(uid=>uid&&uid!==user.id);
  const getDeepLink=()=>`/?g=${groupe.id}&tab=social`+(thread?`&dm=${user.id}&dmName=${encodeURIComponent(user.prenom)}`:"");
  const sendMsg=async()=>{
    if(!msgInput.trim())return;
    const texte=s(msgInput.trim());
    setMsgInput("");
    const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte,destinataire_user_id:thread?.userId||null}).select().single();
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:data.texte,time:"maintenant"}]);
    notifyMessage(getRecipients(),user.prenom,false,getDeepLink());
    onToast("Message envoye !");
  };
  const toggleRecord=async()=>{
    if(recording){
      const blob=await stopRec();
      if(!blob||blob.size<500)return;
      setSendingAudio(true);
      try{
        const audioUrl=await uploadAudio(blob,groupe.id);
        const {data,error}=await supabase.from("messages").insert({groupe_id:groupe.id,auteur_user_id:user.id,auteur_nom:user.prenom,auteur:user.prenom,texte:"",audio_url:audioUrl,destinataire_user_id:thread?.userId||null}).select().single();
        if(error)throw error;
        setMessages(m=>[...m,{id:data.id,auteur:data.auteur_nom,texte:"",audioUrl:data.audio_url,time:"maintenant"}]);
        notifyMessage(getRecipients(),user.prenom,true,getDeepLink());
        onToast("Message vocal envoye !");
      }catch{onToast("Envoi du message vocal impossible","error");}
      setSendingAudio(false);
    }else{
      const ok=await startRec();
      if(!ok)onToast("Micro indisponible ou refuse","error");
    }
  };
  const addM=async()=>{
    if(pickerBusyRef.current)return;
    if(!newM.prenom.trim()||newM.tel.replace(/\D/g,"").length<8)return onToast("Prenom et telephone requis","error");
    if(user.plan==="free"&&groupe.membres.length>=15){setShowAdd(false);setShowUpgrade(true);return;}
    pickerBusyRef.current=true;setPickerBusy(true);
    const payload={groupe_id:groupe.id,prenom:s(newM.prenom.trim()),tel:sPhone(newM.tel),quartier:s(newM.quartier||""),photo_url:newM.photo||null,paye:false,score:80,versements:0,cycles_paies:0,ordre:groupe.membres.length};
    const {data,error}=await supabase.from("membres").insert(payload).select().single();
    pickerBusyRef.current=false;setPickerBusy(false);
    if(error){
      if(error.code==="23505")return onToast("Ce numero est deja membre de cette tontine !","error");
      return onToast("Ajout impossible : "+(error.message||"erreur inconnue"),"error");
    }
    supabase.rpc("link_membre",{p_membre_id:data.id}).then(async()=>{
      const {data:linked}=await supabase.from("membres").select("user_id").eq("id",data.id).single();
      if(linked?.user_id){
        supabase.functions.invoke("send-push",{body:{user_id:linked.user_id,title:"HABY Tontine",body:`Tu as ete ajoute(e) a la tontine "${groupe.nom}" !`,url:`/?g=${groupe.id}`}}).catch(()=>{});
      }
    }).catch(()=>{});
    setGroupe(g=>({...g,membres:[...g.membres,{id:data.id,userId:null,prenom:data.prenom,tel:data.tel,quartier:data.quartier,photo:data.photo_url,score:80,paye:false,cyclesPaies:0,cyclesTotal:g.totalCycles-g.cycle+1,evenement:null,versements:0}]}));
    setNewM({prenom:"",tel:"",quartier:"",photo:""});
    setShowAdd(false);
    onToast(`${data.prenom} a ete ajoute(e) !`);
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
  const updatePhoto=async(mid,e)=>{
    const f=e.target.files?.[0];if(!f)return;
    if(f.size>4*1024*1024)return onToast("Photo max 4 Mo","error");
    try{
      const photoUrl=await uploadPhoto(f,"membres");
      const {error}=await supabase.from("membres").update({photo_url:photoUrl}).eq("id",mid);
      if(error)return onToast("Photo impossible a sauvegarder","error");
      setGroupe(g=>({...g,membres:g.membres.map(m=>m.id===mid?{...m,photo:photoUrl}:m)}));
      onToast("Photo mise a jour !");
    }catch{onToast("Envoi de la photo impossible","error");}
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

  const PRIMARY_TABS=[["membres",t("tabMembres")],["social",t("tabSocial")],["rapport",t("tabRapport")]];
  const SECONDARY_TABS=[["bureau",t("tabBureau")],["tirage",t("tabTirage")],["prets",t("tabPrets")],["reunions",t("tabReunions")],["events",t("tabEvenements")],["checklist",t("tabTaches")]];
  const inSecondary=SECONDARY_TABS.some(([id])=>id===tab);
  return(
    <div style={{paddingBottom:90}}>
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
      <div style={{display:"flex",gap:6,padding:"14px 16px 0"}}>
        {PRIMARY_TABS.map(([id,lbl])=><button key={id} onClick={()=>{setTab(id);setShowMoreTabs(false);}} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===id?"#D4A843":"#0F2419",color:tab===id?"#0A1A0F":"#6B7280",borderColor:tab===id?"#D4A843":"#1B4332"}}>{lbl}</button>)}
        <button onClick={()=>setShowMoreTabs(v=>!v)} style={{flex:1,padding:"9px 6px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:inSecondary||showMoreTabs?"#D4A843":"#0F2419",color:inSecondary||showMoreTabs?"#0A1A0F":"#6B7280",borderColor:inSecondary||showMoreTabs?"#D4A843":"#1B4332"}}>{inSecondary?SECONDARY_TABS.find(([id])=>id===tab)[1]:"⋯ Plus"}</button>
      </div>
      {(showMoreTabs||inSecondary)&&<div style={{display:"flex",gap:6,padding:"8px 16px 0",overflowX:"auto"}}>
        {SECONDARY_TABS.map(([id,lbl])=><button key={id} onClick={()=>setTab(id)} style={{flexShrink:0,padding:"7px 12px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===id?"#D4A843":"#0A1A0F",color:tab===id?"#0A1A0F":"#6B7280",borderColor:tab===id?"#D4A843":"#1B4332"}}>{lbl}</button>)}
      </div>}


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
          <button onClick={()=>{if(user.plan==="free"&&groupe.membres.length>=15){setShowUpgrade(true);}else{setShowAdd(true);}}} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:8,padding:"5px 12px",color:"#D4A843",fontSize:12,fontWeight:700,cursor:"pointer"}}>+ Membre</button>
        </div>
        {aJour.map(m=><MembreRow key={m.id} m={m} onToggle={()=>toggleP(m.id)} onWA={()=>sendWA(m)} montant={groupe.montant} onVersement={openVers} onHistorique={openHisto} onDelete={delM} onPhoto={updatePhoto}/>)}
        {enRet.length>0&&<><p style={{color:"#EF4444",fontSize:12,fontWeight:700,margin:"16px 0 8px"}}>EN RETARD ({enRet.length})</p>{enRet.map(m=><MembreRow key={m.id} m={m} onToggle={()=>toggleP(m.id)} onWA={()=>sendWA(m)} montant={groupe.montant} onVersement={openVers} onHistorique={openHisto} onDelete={delM} onPhoto={updatePhoto}/>)}</>}
      </div>}

      {tab==="bureau"&&<div style={{padding:"14px 16px 0"}}>
        {ROLES.map(([role,label])=>{
          const t=titulaire(role);
          const elec=electionActive(role);
          const tally={};
          if(elec)votes.filter(v=>v.election_id===elec.id).forEach(v=>{tally[v.candidate_membre_id]=(tally[v.candidate_membre_id]||0)+1;});
          return(
            <div key={role} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:16,marginBottom:12}}>
              <p style={{margin:"0 0 10px",color:"#6B7280",fontSize:11,fontWeight:700,letterSpacing:.5}}>{label.toUpperCase()}</p>
              {t?<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><Avatar prenom={t.prenom} photo={t.photo} size={36}/><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:15}}>{t.prenom}</p></div>
              :<p style={{color:"#6B7280",fontSize:13,marginBottom:10}}>Poste non attribue</p>}
              {elec?(
                <div style={{background:"#0A1A0F",borderRadius:10,padding:12,marginTop:6}}>
                  <p style={{margin:"0 0 8px",color:"#D4A843",fontSize:12,fontWeight:700}}>🗳️ Election en cours</p>
                  {elec.candidats.map(cid=>{const c=groupe.membres.find(m=>m.id===cid);return(
                    <div key={cid} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",color:"#FDF6EC",fontSize:13}}><span>{c?.prenom||"?"}</span><span style={{color:"#D4A843",fontWeight:700}}>{tally[cid]||0} voix</span></div>
                  );})}
                  <button onClick={()=>cloturerElection(elec)} style={{marginTop:10,width:"100%",background:"#D4A843",border:"none",borderRadius:10,padding:"9px",color:"#0A1A0F",fontWeight:700,fontSize:12,cursor:"pointer"}}>Cloturer l election</button>
                </div>
              ):(
                <button onClick={()=>{setElectionRole(role);setElectionCands([]);setShowElection(true);}} style={{width:"100%",background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"9px",color:"#D4A843",fontWeight:700,fontSize:12,cursor:"pointer"}}>Lancer une election</button>
              )}
            </div>
          );
        })}
        <div style={{margin:"14px 0 0",background:"#0A1A0F",border:"1px solid #2D6A4F",borderRadius:12,padding:12}}>
          <p style={{margin:0,color:"#6B7280",fontSize:11,lineHeight:1.6}}>ℹ️ Seuls les membres ayant un compte HABY Tontine relie peuvent voter. Tu peux aussi attribuer un poste directement sans election.</p>
        </div>
      </div>}
      {showElection&&<Modal onClose={()=>setShowElection(false)}>
        <MH title={`Election - ${ROLES.find(r=>r[0]===electionRole)?.[1]}`} onClose={()=>setShowElection(false)}/>
        <p style={{color:"#6B7280",fontSize:13,marginBottom:14}}>Choisis au moins 2 candidat(e)s parmi les membres.</p>
        {groupe.membres.map(m=>(
          <div key={m.id} onClick={()=>setElectionCands(c=>c.includes(m.id)?c.filter(x=>x!==m.id):[...c,m.id])} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:electionCands.includes(m.id)?"#1B4332":"#0F2419",border:`1px solid ${electionCands.includes(m.id)?"#D4A843":"#1B4332"}`,borderRadius:10,marginBottom:6,cursor:"pointer"}}>
            <Avatar prenom={m.prenom} photo={m.photo} size={30}/><p style={{margin:0,color:"#FDF6EC",fontSize:13,flex:1}}>{m.prenom}</p>
            {electionCands.includes(m.id)&&<span style={{color:"#D4A843",fontWeight:900}}>✓</span>}
          </div>
        ))}
        <div style={{marginTop:14}}><Btn onClick={lancerElection} disabled={electionBusy}>{electionBusy?"Lancement...":"Lancer l election"}</Btn></div>
      </Modal>}
      {tab==="tirage"&&<div style={{padding:"14px 16px 0"}}>
        {gagnantCycleActuel?(()=>{const g=groupe.membres.find(m=>m.id===gagnantCycleActuel.membre_id);return(
          <div style={{background:"linear-gradient(135deg,#1B4332,#0F2419)",border:"1px solid #D4A843",borderRadius:16,padding:20,textAlign:"center",marginBottom:16}}>
            <p style={{margin:0,color:"#6B7280",fontSize:12,fontWeight:600}}>GAGNANTE DU CYCLE {groupe.cycle}</p>
            <div style={{margin:"12px auto 8px"}}><Avatar prenom={g?.prenom||"?"} photo={g?.photo} size={64}/></div>
            <p style={{margin:0,color:"#D4A843",fontSize:20,fontWeight:900}}>{g?.prenom||"Membre retire"}</p>
            <p style={{margin:"4px 0 0",color:"#6B7280",fontSize:12}}>Tiree au sort le {new Date(gagnantCycleActuel.created_at).toLocaleDateString("fr-FR")}</p>
          </div>
        );})():(
          <div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:16,padding:20,textAlign:"center",marginBottom:16}}>
            <p style={{fontSize:36,margin:"0 0 8px"}}>🎲</p>
            <p style={{color:"#FDF6EC",fontSize:14,fontWeight:700,margin:0}}>Aucun tirage pour le cycle {groupe.cycle} pour le moment</p>
            <p style={{color:"#6B7280",fontSize:12,margin:"6px 0 16px"}}>{eligibles.length} membre(s) pas encore tire(s) au sort sur cette rotation</p>
            <button onClick={lancerTirage} disabled={tirageBusy||eligibles.length===0} style={{background:"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:12,padding:"12px 24px",color:"#0A1A0F",fontWeight:800,fontSize:14,cursor:"pointer"}}>{tirageBusy?"Tirage en cours...":"🎲 Lancer le tirage au sort"}</button>
          </div>
        )}
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"16px 0 10px",letterSpacing:.5}}>HISTORIQUE DES TIRAGES (TRANSPARENT)</p>
        {tirages.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:10}}>Aucun tirage effectue pour l instant</p>
        :[...tirages].reverse().map(t=>{const m=groupe.membres.find(mm=>mm.id===t.membre_id);return(
          <div key={t.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{background:"#1B4332",color:"#D4A843",fontSize:11,fontWeight:800,padding:"3px 8px",borderRadius:8}}>Cycle {t.cycle}</span>
            <p style={{margin:0,color:"#FDF6EC",fontSize:13,fontWeight:700,flex:1}}>{m?.prenom||"Membre retire"}</p>
            <p style={{margin:0,color:"#6B7280",fontSize:11}}>{new Date(t.created_at).toLocaleDateString("fr-FR")}</p>
          </div>
        );})}
        {tirageAnim&&<div style={{position:"fixed",inset:0,background:"rgba(10,26,15,0.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <div style={{textAlign:"center"}}>
            <p style={{fontSize:60,margin:0,animation:"spin 0.5s linear infinite",display:"inline-block"}}>🎲</p>
            <p style={{color:"#D4A843",fontSize:16,fontWeight:800,marginTop:16}}>Tirage au sort en cours...</p>
          </div>
        </div>}
      </div>}
      {tab==="prets"&&<div style={{padding:"14px 16px 0"}}>
        <button onClick={()=>setShowPret(true)} style={{width:"100%",background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"10px",color:"#D4A843",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:14}}>+ Nouveau pret</button>
        {prets.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:20}}>Aucun pret pour le moment</p>
        :prets.map(p=>{const m=groupe.membres.find(mm=>mm.id===p.membre_id);const total=p.montant*(1+p.taux_interet/100);const reste=total-p.montant_rembourse;return(
          <div key={p.id} style={{background:"#0F2419",border:`1px solid ${p.statut==="rembourse"?"#1B4332":"#D4A843"}`,borderRadius:14,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={m?.prenom||"?"} photo={m?.photo} size={36}/><div><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{m?.prenom||"Membre retire"}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>{p.taux_interet>0?`${p.taux_interet}% d interet`:"Sans interet"}</p></div></div>
              <span style={{background:p.statut==="rembourse"?"#1B4332":"#1A0800",color:p.statut==="rembourse"?"#22C55E":"#D4A843",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99}}>{p.statut==="rembourse"?"Rembourse":"En cours"}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",margin:"12px 0"}}>
              <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Emprunte</p><p style={{margin:"2px 0 0",color:"#FDF6EC",fontWeight:700,fontSize:13}}>{fmtFCFA(p.montant)}</p></div>
              <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Rembourse</p><p style={{margin:"2px 0 0",color:"#22C55E",fontWeight:700,fontSize:13}}>{fmtFCFA(p.montant_rembourse)}</p></div>
              <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Reste</p><p style={{margin:"2px 0 0",color:"#D4A843",fontWeight:700,fontSize:13}}>{fmtFCFA(Math.max(0,reste))}</p></div>
            </div>
            {p.statut!=="rembourse"&&<button onClick={()=>{setRemboM(p);setRemboAmt("");}} style={{width:"100%",background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"9px",color:"#D4A843",fontWeight:700,fontSize:12,cursor:"pointer"}}>+ Remboursement</button>}
          </div>
        );})}
      </div>}
      {showPret&&<Modal onClose={()=>setShowPret(false)}>
        <MH title="Nouveau pret" onClose={()=>setShowPret(false)}/>
        <Fld label="Membre emprunteur"><select value={newPret.membreId} onChange={e=>setNewPret(p=>({...p,membreId:e.target.value}))} style={{width:"100%",background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:12,padding:"13px 14px",color:"#FDF6EC",fontSize:14}}><option value="">Choisir...</option>{groupe.membres.map(m=><option key={m.id} value={m.id}>{m.prenom}</option>)}</select></Fld>
        <Fld label="Montant du pret (FCFA)"><Inp value={newPret.montant} onChange={e=>setNewPret(p=>({...p,montant:e.target.value.replace(/\D/g,"")}))} placeholder="Ex: 50000" inputMode="numeric"/></Fld>
        <Fld label="Taux d interet (%, optionnel)"><Inp value={newPret.taux} onChange={e=>setNewPret(p=>({...p,taux:e.target.value.replace(/\D/g,"")}))} placeholder="0" inputMode="numeric"/></Fld>
        <Fld label="Date d echeance (optionnel)"><Inp value={newPret.echeance} onChange={e=>setNewPret(p=>({...p,echeance:e.target.value}))} type="date"/></Fld>
        <Btn onClick={creerPret} disabled={pretBusy}>{pretBusy?"Enregistrement...":"Enregistrer le pret"}</Btn>
      </Modal>}
      {remboM&&<Modal onClose={()=>setRemboM(null)}>
        <MH title="Enregistrer un remboursement" onClose={()=>setRemboM(null)}/>
        <Fld label="Montant rembourse (FCFA)"><Inp value={remboAmt} onChange={e=>setRemboAmt(e.target.value.replace(/\D/g,""))} placeholder="Ex: 10000" inputMode="numeric" autoFocus/></Fld>
        <Btn onClick={rembourserPret}>Confirmer</Btn>
      </Modal>}
      {tab==="reunions"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"#0F2419",border:"1px solid #D4A843",borderRadius:14,padding:16,marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <p style={{margin:0,color:"#D4A843",fontWeight:800,fontSize:14}}>Reglement interieur</p>
            <button onClick={()=>{setReglementTxt(groupe.reglement||"");setEditReglement(e=>!e);}} style={{background:"transparent",border:"1px solid #2D6A4F",borderRadius:8,padding:"5px 10px",color:"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer"}}>{editReglement?"Annuler":"Modifier"}</button>
          </div>
          {editReglement?(
            <>
              <textarea value={reglementTxt} onChange={e=>setReglementTxt(e.target.value)} rows={8} placeholder="Ex: Toute cotisation doit etre versee avant le 5 du mois. En cas de retard..." style={{width:"100%",background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:12,padding:"12px 14px",color:"#FDF6EC",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
              <div style={{marginTop:10}}><Btn onClick={enregistrerReglement} disabled={reglementBusy}>{reglementBusy?"Enregistrement...":"Enregistrer"}</Btn></div>
            </>
          ):(groupe.reglement?<p style={{color:"#FDF6EC",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap",margin:0}}>{groupe.reglement}</p>:<p style={{color:"#6B7280",fontSize:13,margin:0}}>Aucun reglement redige pour l instant</p>)}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <p style={{color:"#6B7280",fontSize:12,fontWeight:700,letterSpacing:.5}}>COMPTES RENDUS DE REUNION</p>
          <button onClick={()=>setShowRapport(true)} style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:8,padding:"5px 10px",color:"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Ajouter</button>
        </div>
        {rapports.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:20}}>Aucun compte rendu pour l instant</p>
        :rapports.map(r=>(
          <div key={r.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:16,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{r.titre}</p><p style={{margin:"3px 0 0",color:"#D4A843",fontSize:11}}>{r.date_reunion?new Date(r.date_reunion).toLocaleDateString("fr-FR"):""}</p></div>
              <button onClick={()=>supprimerRapport(r.id)} style={{background:"transparent",border:"none",color:"#EF4444",fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            {r.contenu&&<p style={{margin:"10px 0 0",color:"#6B7280",fontSize:13,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{r.contenu}</p>}
          </div>
        ))}
      </div>}
      {showRapport&&<Modal onClose={()=>setShowRapport(false)}>
        <MH title="Nouveau compte rendu" onClose={()=>setShowRapport(false)}/>
        <Fld label="Titre"><Inp value={newRapport.titre} onChange={e=>setNewRapport(r=>({...r,titre:e.target.value}))} placeholder="Ex: Reunion mensuelle Juillet" maxLength={80} autoFocus/></Fld>
        <Fld label="Date de la reunion"><Inp value={newRapport.date} onChange={e=>setNewRapport(r=>({...r,date:e.target.value}))} type="date"/></Fld>
        <Fld label="Notes / decisions prises"><textarea value={newRapport.contenu} onChange={e=>setNewRapport(r=>({...r,contenu:e.target.value}))} rows={5} placeholder="Ce qui a ete discute et decide..." style={{width:"100%",background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:12,padding:"12px 14px",color:"#FDF6EC",fontSize:14,outline:"none",resize:"vertical",fontFamily:"inherit"}}/></Fld>
        <Btn onClick={creerRapport} disabled={rapportBusy}>{rapportBusy?"Enregistrement...":"Enregistrer"}</Btn>
      </Modal>}
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

      {tab==="social"&&<div style={{padding:"14px 16px 100px"}}>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,marginBottom:6}}>
          <button onClick={()=>setThread(null)} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:!thread?"#D4A843":"#0F2419",border:"1px solid "+(!thread?"#D4A843":"#1B4332"),borderRadius:99,padding:"7px 14px",color:!thread?"#0A1A0F":"#FDF6EC",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>💬 Groupe</button>
          {groupe.membres.filter(m=>m.userId&&m.userId!==user.id).map(m=>(
            <button key={m.id} onClick={()=>setThread({userId:m.userId,prenom:m.prenom})} style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,background:thread?.userId===m.userId?"#D4A843":"#0F2419",border:"1px solid "+(thread?.userId===m.userId?"#D4A843":"#1B4332"),borderRadius:99,padding:"6px 14px 6px 6px",color:thread?.userId===m.userId?"#0A1A0F":"#FDF6EC",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}><Avatar prenom={m.prenom} photo={m.photo} size={22}/>{m.prenom}</button>
          ))}
        </div>
        {groupe.membres.filter(m=>m.userId&&m.userId!==user.id).length===0&&<p style={{color:"#6B7280",fontSize:11,margin:"0 0 10px",textAlign:"center"}}>Aucun autre membre n a encore de compte HABY relie pour recevoir un message prive.</p>}
        {thread&&<p style={{color:"#D4A843",fontSize:11,fontWeight:700,margin:"0 0 10px",textAlign:"center"}}>🔒 Conversation privee avec {thread.prenom}</p>}
        {messages.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",padding:10}}>Aucun message pour l instant</p>
        :messages.map(m=><div key={m.id} style={{display:"flex",gap:10,marginBottom:12}}><Avatar prenom={m.auteur} size={34} gold={m.auteur==="HABY"}/><div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:"0 14px 14px 14px",padding:"10px 14px",flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><p style={{margin:0,color:"#D4A843",fontSize:12,fontWeight:700}}>{m.auteur}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>{m.time}</p></div>{m.audioUrl?<audio controls src={m.audioUrl} style={{width:"100%",height:34}}/>:<p style={{margin:0,color:"#FDF6EC",fontSize:14}}>{m.texte}</p>}</div></div>)}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={toggleRecord} disabled={sendingAudio} style={{background:recording?"#C1440E":"#1B4332",border:"1px solid #2D6A4F",borderRadius:12,width:44,height:44,color:recording?"#fff":"#D4A843",fontSize:18,cursor:"pointer",flexShrink:0}}>{sendingAudio?"⏳":recording?"⏹":"🎤"}</button>
          <input value={msgInput} onChange={e=>setMsgInput(s(e.target.value))} placeholder={thread?`Message prive a ${thread.prenom}...`:"Ecrire au groupe..."} maxLength={200} onKeyDown={e=>e.key==="Enter"&&sendMsg()} style={{flex:1,background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 14px",color:"#FDF6EC",fontSize:14,outline:"none"}}/>
          <button onClick={sendMsg} style={{background:"#D4A843",border:"none",borderRadius:12,padding:"0 16px",color:"#0A1A0F",fontWeight:900,cursor:"pointer",fontSize:18}}>→</button>
        </div>
        {recording&&<p style={{color:"#C1440E",fontSize:11,margin:"6px 0 0",textAlign:"center"}}>🔴 Enregistrement en cours... clique sur ⏹ pour envoyer</p>}
      </div>}

      {tab==="rapport"&&<div style={{padding:"14px 16px 0"}}>
        <div style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:16,padding:16,marginBottom:14}}>
          <p style={{color:"#D4A843",fontWeight:800,margin:"0 0 14px",fontSize:15}}>Bilan - Cycle {groupe.cycle}/{groupe.totalCycles}</p>
          {[["Total collecte ce cycle",fmtFCFA(collecte)],["Cagnotte du tour (calcul auto)",fmtFCFA(cagnotteTour)],["Caisse sociale",fmtFCFA(groupe.caisseSociale)],["Taux ponctualite",`${taux}%`],["Membres a jour",`${aJour.length}/${groupe.membres.length}`],["Prochain tour",groupe.prochainTour],["Cycles restants",groupe.totalCycles-groupe.cycle],["Total fin de cycle",fmtFCFA(groupe.membres.length*groupe.montant*groupe.totalCycles)]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #1B4332"}}><span style={{color:"#6B7280",fontSize:13}}>{l}</span><span style={{color:"#FDF6EC",fontWeight:700,fontSize:13}}>{v}</span></div>)}
        </div>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,marginBottom:8}}>SUIVI PAR MEMBRE</p>
        {groupe.membres.map(m=><div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1B4332"}}><div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={m.prenom} size={32}/><p style={{margin:0,color:"#FDF6EC",fontSize:13}}>{m.prenom}</p></div><div style={{textAlign:"right"}}><p style={{margin:0,color:"#D4A843",fontSize:12,fontWeight:700}}>{fmtFCFA(m.cyclesPaies*groupe.montant)}</p><p style={{margin:0,color:"#6B7280",fontSize:11}}>{m.cyclesPaies}/{m.cyclesTotal} cycles</p></div></div>)}
        <Btn onClick={exporterRapportPDF}>Exporter rapport PDF</Btn>
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

      {showAdd&&<Modal onClose={()=>{if(!pickerBusy)setShowAdd(false);}}>
        <MH title="Ajouter un membre" onClose={()=>{if(!pickerBusy)setShowAdd(false);}}/>
        <div style={{opacity:pickerBusy?0.4:1,pointerEvents:pickerBusy?"none":"auto",transition:"opacity 0.15s"}}>
        <p style={{color:"#6B7280",fontSize:13,marginBottom:16,lineHeight:1.6}}>Le chef de tontine ajoute les membres. Un rappel WhatsApp leur sera envoye.</p>
        {"contacts" in navigator&&"ContactsManager" in window&&<button disabled={pickerBusy} onClick={async()=>{
          if(pickerBusyRef.current)return;
          pickerBusyRef.current=true;setPickerBusy(true);
          try{
            const c=await navigator.contacts.select(["name","tel"],{multiple:false});
            if(c&&c[0]){setNewM(n=>({...n,prenom:c[0].name?.[0]?.split(" ")[0]||n.prenom,tel:sPhone(c[0].tel?.[0]||n.tel)}));onToast("Contact selectionne !");}
          }catch{}
          finally{pickerBusyRef.current=false;setPickerBusy(false);}
        }} style={{width:"100%",background:pickerBusy?"#0F2419":"#1B4332",border:"1px solid #D4A843",borderRadius:12,padding:"12px",color:pickerBusy?"#6B7280":"#D4A843",fontWeight:700,fontSize:13,cursor:pickerBusy?"not-allowed":"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>{pickerBusy?"Ouverture des contacts...":"📇 Choisir depuis mes contacts"}</button>}
        <Fld label="Photo (optionnel)"><div style={{display:"flex",alignItems:"center",gap:12}}>{newM.photo?<img src={newM.photo} style={{width:50,height:50,borderRadius:14,objectFit:"cover"}} alt=""/>:<div style={{width:50,height:50,borderRadius:14,background:"#1B4332",display:"flex",alignItems:"center",justifyContent:"center",color:"#6B7280",fontSize:20}}>📷</div>}<label style={{background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"8px 14px",color:"#D4A843",fontWeight:700,fontSize:12,cursor:"pointer"}}>{newM.photo?"Changer":"Ajouter"}<input type="file" accept="image/*" hidden onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>4*1024*1024)return onToast("Photo max 4 Mo","error");try{const url=await uploadPhoto(f,"membres");setNewM(n=>({...n,photo:url}));}catch{onToast("Envoi de la photo impossible","error");}}}/></label></div></Fld>
        <Fld label="Prenom"><Inp value={newM.prenom} onChange={e=>setNewM(n=>({...n,prenom:e.target.value}))} placeholder="Ex: Fatoumata" maxLength={30} autoFocus/></Fld>
        <Fld label="Numero WhatsApp"><Inp value={newM.tel} onChange={e=>setNewM(n=>({...n,tel:sPhone(e.target.value)}))} placeholder="+223 76 XX XX XX" type="tel" maxLength={16}/></Fld>
        <Fld label="Quartier (optionnel)"><Inp value={newM.quartier||""} onChange={e=>setNewM(n=>({...n,quartier:e.target.value}))} placeholder="Ex: Hamdallaye ACI" maxLength={40}/></Fld>
        </div>
        <Btn onClick={addM} disabled={pickerBusy}>{pickerBusy?"⏳ Ajout en cours...":"Ajouter ce membre"}</Btn>
      </Modal>}
      {showUpgrade&&<Modal onClose={()=>setShowUpgrade(false)}>
        <MH title="Limite atteinte" onClose={()=>setShowUpgrade(false)}/>
        <div style={{textAlign:"center",padding:"10px 0 4px"}}><p style={{fontSize:40,margin:0}}>🔒</p></div>
        <p style={{color:"#FDF6EC",fontSize:15,fontWeight:700,textAlign:"center",margin:"8px 0 4px"}}>15 membres, c'est le maximum en gratuit</p>
        <p style={{color:"#6B7280",fontSize:13,textAlign:"center",lineHeight:1.6,marginBottom:20}}>Passe a HABY Premium pour ajouter des membres illimites dans cette tontine, et beneficier de toutes les autres fonctionnalites avancees.</p>
        <button onClick={async()=>{
          setPayBusy(true);
          const {data,error}=await supabase.functions.invoke("cinetpay-init",{});
          setPayBusy(false);
          if(error||data?.error)return onToast("Erreur : "+(data?.error||error?.message||"paiement indisponible"),"error");
          if(data?.payment_url)window.open(data.payment_url,"_blank");
        }} disabled={payBusy} style={{width:"100%",background:"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:12,padding:"13px",color:"#0A1A0F",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:12}}>{payBusy?"Ouverture du paiement...":"💳 Payer en ligne maintenant - 1 000 FCFA"}</button>
        <p style={{color:"#6B7280",fontSize:11,textAlign:"center",margin:"0 0 12px"}}>OU manuellement via WhatsApp :</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Orange Money</button>
          <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Wave</button>
        </div>
      </Modal>}
      {showEdit&&<Modal onClose={()=>setShowEdit(false)}>
        <MH title="Modifier la tontine" onClose={()=>setShowEdit(false)}/>
        <Fld label="Nom"><Inp value={editG.nom} onChange={e=>setEditG(g=>({...g,nom:e.target.value}))} placeholder="Nom de la tontine" maxLength={40} autoFocus/></Fld>
        <Fld label="Montant par cotisation (FCFA)"><Inp value={editG.montant} onChange={e=>setEditG(g=>({...g,montant:e.target.value.replace(/\D/g,"")}))} placeholder="25000" inputMode="numeric"/></Fld>
        <Fld label="Frequence"><div style={{display:"flex",gap:8}}>{["Hebdo","Bimensuel","Mensuel"].map(f=><button key={f} onClick={()=>setEditG(g=>({...g,frequence:f}))} style={{flex:1,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:editG.frequence===f?"#D4A843":"#1B4332",color:editG.frequence===f?"#0A1A0F":"#FDF6EC",borderColor:editG.frequence===f?"#D4A843":"#2D6A4F"}}>{f}</button>)}</div></Fld>
        <Fld label="Date d'echeance (prochain versement)"><Inp value={editG.dateEcheance} onChange={e=>setEditG(g=>({...g,dateEcheance:e.target.value}))} type="date"/></Fld>
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
    <div style={{paddingBottom:90}}>
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
  const [paiements,setPaiements]=useState([]);
  const [tontinesList,setTontinesList]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState(null);
  useEffect(()=>{
    (async()=>{
      const [{data:us,error:e1},{data:gs},{data:txs,error:e3},{data:pmts}]=await Promise.all([
        supabase.from("users").select("*").order("created_at",{ascending:false}),
        supabase.from("groupes").select("*").order("created_at",{ascending:false}),
        supabase.from("transactions").select("montant"),
        supabase.from("paiements").select("*").order("created_at",{ascending:false}),
      ]);
      if(e1)onToast("Erreur de chargement : "+(e1.message||"inconnue"),"error");
      else setUsers(us||[]);
      if(!e3)setTotalCollecte((txs||[]).reduce((a,t)=>a+(Number(t.montant)||0),0));
      setGroupesCount((gs||[]).length);
      setPaiements(pmts||[]);
      if(gs&&gs.length>0){
        const groupeIds=gs.map(g=>g.id);
        const {data:mm}=await supabase.from("membres").select("groupe_id").in("groupe_id",groupeIds);
        const countByGroupe={};
        (mm||[]).forEach(m=>{countByGroupe[m.groupe_id]=(countByGroupe[m.groupe_id]||0)+1;});
        const withCreator=gs.map(g=>{
          const createur=(us||[]).find(u=>u.id===g.user_id);
          return {...g,membresCount:countByGroupe[g.id]||0,createurNom:createur?.prenom||"?",createurTel:createur?.telephone||""};
        });
        setTontinesList(withCreator);
      }
      setLoading(false);
    })();
  },[]);
  const totalUsers=users.length;
  const totalPremium=users.filter(u=>u.plan==="premium").length;

  const today=new Date().toDateString();
  const yesterday=new Date(Date.now()-86400000).toDateString();
  const weekAgo=Date.now()-7*86400000;
  const connecteesAuj=users.filter(u=>u.derniere_connexion&&new Date(u.derniere_connexion).toDateString()===today).length;
  const connecteesHier=users.filter(u=>u.derniere_connexion&&new Date(u.derniere_connexion).toDateString()===yesterday).length;
  const connecteesSemaine=users.filter(u=>u.derniere_connexion&&new Date(u.derniere_connexion).getTime()>=weekAgo).length;

  const paiementsAcceptes=paiements.filter(p=>p.statut==="accepted");
  const revenuTotal=paiementsAcceptes.reduce((a,p)=>a+(Number(p.montant)||0),0);
  const debutMois=new Date();debutMois.setDate(1);debutMois.setHours(0,0,0,0);
  const revenuMois=paiementsAcceptes.filter(p=>new Date(p.created_at)>=debutMois).reduce((a,p)=>a+(Number(p.montant)||0),0);
  const paiementsAuj=paiementsAcceptes.filter(p=>new Date(p.created_at).toDateString()===today).length;

  const toggleAdmin=async(u)=>{
    const newRole=u.role==="admin"?"user":"admin";
    setBusyId(u.id);
    const {error}=await supabase.from("users").update({role:newRole}).eq("id",u.id);
    setBusyId(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setUsers(list=>list.map(x=>x.id===u.id?{...x,role:newRole}:x));
    onToast(newRole==="admin"?`${u.prenom} est maintenant co-administrateur !`:`${u.prenom} n est plus administrateur`);
    if(newRole==="admin"){
      supabase.functions.invoke("send-push",{body:{user_id:u.id,title:"HABY Tontine",body:"Tu es maintenant co-administrateur de la plateforme !"}}).catch(()=>{});
    }
  };
  const togglePremium=async(u)=>{
    const newPlan=u.plan==="premium"?"free":"premium";
    setBusyId(u.id);
    const {error}=await supabase.from("users").update({plan:newPlan}).eq("id",u.id);
    setBusyId(null);
    if(error)return onToast("Erreur : "+(error.message||"inconnue"),"error");
    setUsers(list=>list.map(x=>x.id===u.id?{...x,plan:newPlan}:x));
    onToast(newPlan==="premium"?`${u.prenom} est maintenant Premium !`:`${u.prenom} repasse en Gratuit`);
    if(newPlan==="premium"){
      supabase.functions.invoke("send-push",{body:{user_id:u.id,title:"HABY Tontine",body:"Ton compte est maintenant Premium ! Merci pour ta confiance."}}).catch(()=>{});
    }
  };
  return(
    <div style={{paddingBottom:90}}>
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
      <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"18px 16px 8px",letterSpacing:.5}}>ACTIVITE (BASEE SUR LES CONNEXIONS)</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"0 16px"}}>
        {[["Aujourd'hui",connecteesAuj],["Hier",connecteesHier],["7 derniers jours",connecteesSemaine]].map(([l,v])=>(
          <div key={l} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
            <p style={{margin:0,color:"#D4A843",fontSize:18,fontWeight:900}}>{v}</p>
            <p style={{margin:"3px 0 0",color:"#6B7280",fontSize:10}}>{l}</p>
          </div>
        ))}
      </div>
      <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"18px 16px 8px",letterSpacing:.5}}>REVENUS (PAIEMENTS CINETPAY REELS)</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"0 16px"}}>
        {[["Revenu total",fmtFCFA(revenuTotal)],["Ce mois-ci",fmtFCFA(revenuMois)],["Paiements reussis",paiementsAcceptes.length],["Paiements aujourd'hui",paiementsAuj]].map(([l,v])=>(
          <div key={l} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:14,padding:14}}>
            <p style={{margin:0,color:"#6B7280",fontSize:11,fontWeight:600}}>{l}</p>
            <p style={{margin:"4px 0 0",color:"#22C55E",fontSize:18,fontWeight:900}}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{margin:"12px 16px 0",background:"#0A1A0F",border:"1px solid #2D6A4F",borderRadius:12,padding:12}}>
        <p style={{margin:0,color:"#6B7280",fontSize:11,lineHeight:1.6}}>✅ Toutes ces donnees sont desormais 100% reelles : tontines, membres, cotisations et paiements viennent directement de Supabase, tous comptes confondus. ℹ️ "Connectee" = derniere ouverture de l app, pas presence en direct.</p>
      </div>
      <div style={{padding:"18px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 8px",letterSpacing:.5}}>TONTINES CREEES ({tontinesList.length}) - CREATRICES</p>
        {loading?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:10}}>Chargement...</p>
        :tontinesList.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",marginTop:10}}>Aucune tontine creee pour le moment</p>
        :tontinesList.map(g=>(
          <div key={g.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><p style={{margin:0,color:"#FDF6EC",fontWeight:700,fontSize:14}}>{g.nom}</p><p style={{margin:"2px 0 0",color:"#6B7280",fontSize:11}}>Creee par {g.createurNom} ({g.createurTel})</p></div>
              <span style={{background:"#1B4332",color:"#D4A843",fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99}}>{g.membresCount} membre(s)</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
              <p style={{margin:0,color:"#6B7280",fontSize:11}}>{fmtFCFA(g.montant)}/{g.frequence} - Cycle {g.cycle}/{g.total_cycles}</p>
              <p style={{margin:0,color:"#6B7280",fontSize:11}}>{new Date(g.created_at).toLocaleDateString("fr-FR")}</p>
            </div>
          </div>
        ))}
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
          <div style={{display:"flex",gap:6,width:"100%",marginTop:2}}>
            <button onClick={()=>togglePremium(u)} disabled={busyId===u.id} style={{flex:1,background:u.plan==="premium"?"transparent":"#D4A843",border:`1px solid ${u.plan==="premium"?"#C1440E":"#D4A843"}`,borderRadius:10,padding:"6px 10px",color:u.plan==="premium"?"#EF4444":"#0A1A0F",fontSize:11,fontWeight:700,cursor:"pointer"}}>{busyId===u.id?"...":u.plan==="premium"?"Repasser Gratuit":"Activer Premium"}</button>
            {u.id!==currentUserId&&<button onClick={()=>toggleAdmin(u)} disabled={busyId===u.id} style={{flex:1,background:u.role==="admin"?"transparent":"#1B4332",border:`1px solid ${u.role==="admin"?"#C1440E":"#2D6A4F"}`,borderRadius:10,padding:"6px 10px",color:u.role==="admin"?"#EF4444":"#D4A843",fontSize:11,fontWeight:700,cursor:"pointer"}}>{busyId===u.id?"...":u.role==="admin"?"Retirer admin":"Nommer co-admin"}</button>}
          </div>
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
  const [payBusy,setPayBusy]=useState(false);
  const [parrainages,setParrainages]=useState([]);
  useEffect(()=>{
    (async()=>{
      const {data}=await supabase.from("parrainages").select("*").eq("parrain_id",user.id);
      setParrainages(data||[]);
    })();
  },[user.id]);
  const partagerCode=()=>{
    const msg=encodeURIComponent(`Rejoins-moi sur HABY Tontine pour gerer tes tontines simplement !\n\nUtilise mon code de parrainage a l inscription : ${user.parrainCode}\n\nhttps://haby-tontine.netlify.app`);
    window.open(`https://wa.me/?text=${msg}`,"_blank");
  };
  const exporterDonnees=async()=>{
    onToast("Preparation de l export...");
    const [{data:groupes},{data:cagnottes},{data:objectifs}]=await Promise.all([
      supabase.from("groupes").select("*").eq("user_id",user.id),
      supabase.from("cagnottes").select("*").eq("user_id",user.id),
      supabase.from("objectifs").select("*").eq("user_id",user.id),
    ]);
    const groupeIds=(groupes||[]).map(g=>g.id);
    const {data:membres}=groupeIds.length>0?await supabase.from("membres").select("*").in("groupe_id",groupeIds):{data:[]};
    const {data:transactions}=groupeIds.length>0?await supabase.from("transactions").select("*").in("groupe_id",groupeIds):{data:[]};
    const payload={
      exporte_le:new Date().toISOString(),
      profil:{prenom:user.prenom,telephone:user.tel,plan:user.plan},
      tontines:groupes||[],
      membres:membres||[],
      transactions:transactions||[],
      cagnottes:cagnottes||[],
      epargne:objectifs||[],
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`haby-tontine-donnees-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
    onToast("Donnees telechargees !");
  };
  const onPayCinetPay=async()=>{
    setPayBusy(true);
    const {data,error}=await supabase.functions.invoke("cinetpay-init",{});
    setPayBusy(false);
    if(error||data?.error)return onToast("Erreur : "+(data?.error||error?.message||"paiement indisponible"),"error");
    if(data?.payment_url)window.open(data.payment_url,"_blank");
  };
  const [showOut,setShowOut]=useState(false);
  const [showSupport,setShowSupport]=useState(false);
  const [notifBusy,setNotifBusy]=useState(false);
  const [notifOn,setNotifOn]=useState(false);
  useEffect(()=>{
    (async()=>{
      if(!("serviceWorker" in navigator)||!("PushManager" in window))return;
      try{
        const reg=await navigator.serviceWorker.getRegistration("/sw.js");
        const sub=reg&&await reg.pushManager.getSubscription();
        setNotifOn(!!sub&&Notification.permission==="granted");
      }catch{}
    })();
  },[]);
  const toggleNotifications=async()=>{
    if(!("serviceWorker" in navigator)||!("PushManager" in window))return onToast("Notifications non supportees sur ce navigateur","error");
    setNotifBusy(true);
    try{
      if(notifOn){
        const reg=await navigator.serviceWorker.getRegistration("/sw.js");
        const sub=reg&&await reg.pushManager.getSubscription();
        if(sub)await sub.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("user_id",user.id);
        setNotifOn(false);setNotifBusy(false);
        onToast("Notifications desactivees");
        return;
      }
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){setNotifBusy(false);return onToast("Autorisation refusee","error");}
      const reg=await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
      const {error}=await supabase.from("push_subscriptions").upsert({user_id:user.id,subscription:sub.toJSON()},{onConflict:"user_id"});
      if(error){setNotifBusy(false);return onToast("Impossible d activer les notifications","error");}
      const {data,error:pushErr}=await supabase.functions.invoke("send-push",{body:{user_id:user.id,title:"HABY Tontine",body:"Notifications activees avec succes !"}});
      setNotifOn(true);setNotifBusy(false);
      if(pushErr||data?.error)return onToast("Active, mais l envoi test a echoue : "+(data?.error||pushErr?.message||"erreur"),"error");
      onToast("Notifications activees ! Elles resteront actives jusqu a ce que tu les desactives.");
    }catch(e){setNotifBusy(false);onToast("Erreur : "+(e.message||"inconnue"),"error");}
  };
  return(
    <div style={{paddingBottom:90}}>
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
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[["fr","Francais"],["en","English"],["bm","Bamanankan"],["ar","العربية"]].map(([code,label])=>(
              <button key={code} onClick={()=>onChangeLang(code)} style={{flex:"1 1 45%",minWidth:90,padding:"10px 4px",borderRadius:10,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:700,background:lang===code?"#D4A843":"#1B4332",color:lang===code?"#0A1A0F":"#FDF6EC",borderColor:lang===code?"#D4A843":"#2D6A4F"}}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{background:"#0F2419",border:"1px solid #D4A843",borderRadius:14,padding:16,marginBottom:16}}>
          <p style={{margin:"0 0 6px",color:"#D4A843",fontWeight:800,fontSize:15}}>🎁 Parraine et gagne du Premium</p>
          <p style={{margin:"0 0 12px",color:"#6B7280",fontSize:12,lineHeight:1.6}}>Chaque filleul(e) qui passe Premium te fait gagner 1 mois gratuit, cumulable !</p>
          <div style={{background:"#0A1A0F",borderRadius:10,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <p style={{margin:0,color:"#FDF6EC",fontSize:18,fontWeight:900,letterSpacing:2}}>{user.parrainCode||"..."}</p>
            <span style={{color:"#6B7280",fontSize:11}}>Ton code</span>
          </div>
          <div style={{display:"flex",gap:16,marginBottom:12}}>
            <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Filleul(e)s</p><p style={{margin:"2px 0 0",color:"#FDF6EC",fontWeight:800,fontSize:16}}>{parrainages.length}</p></div>
            <div><p style={{margin:0,color:"#6B7280",fontSize:11}}>Devenus Premium</p><p style={{margin:"2px 0 0",color:"#22C55E",fontWeight:800,fontSize:16}}>{parrainages.filter(p=>p.statut==="premium").length}</p></div>
          </div>
          <button onClick={partagerCode} style={{width:"100%",background:"#075E54",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Partager mon code sur WhatsApp</button>
        </div>
        {user.plan==="free"&&<div style={{background:"linear-gradient(135deg,#1A0800,#3D1500)",border:"1px solid #D4A843",borderRadius:18,padding:18,marginBottom:16}}>
          <p style={{margin:"0 0 4px",color:"#D4A843",fontWeight:800,fontSize:16}}>Passer a HABY Premium</p>
          <p style={{margin:"0 0 14px",color:"#FDF6EC",fontSize:13,lineHeight:1.6}}>Debloque toutes les fonctionnalites pour developper tes tontines !</p>
          <div style={{background:"#0A1A0F",borderRadius:12,padding:14,marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"flex-end",gap:20,marginBottom:8}}><span style={{color:"#6B7280",fontSize:11,fontWeight:700,width:70,textAlign:"center"}}>GRATUIT</span><span style={{color:"#D4A843",fontSize:11,fontWeight:800,width:80,textAlign:"center"}}>PREMIUM</span></div>
            {[["Tontines actives","1 max","Illimite"],["Membres/groupe","15 max","Illimite"],["HABY IA","Basique","Prioritaire"],["Support","Standard","24h"]].map(([f,fr,pr])=>(
              <div key={f} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #1B4332",fontSize:12}}>
                <span style={{color:"#6B7280"}}>{f}</span>
                <div style={{display:"flex",gap:20}}><span style={{color:fr==="Non"?"#EF4444":"#6B7280",width:70,textAlign:"center"}}>{fr}</span><span style={{color:"#D4A843",fontWeight:700,width:80,textAlign:"center"}}>{pr}</span></div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <button onClick={onPayCinetPay} disabled={payBusy} style={{flex:1,background:"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:12,padding:"14px",color:"#0A1A0F",fontWeight:800,fontSize:14,cursor:"pointer"}}>{payBusy?"...":"1 000 FCFA/mois"}</button>
            <button onClick={onPayCinetPay} disabled={payBusy} style={{flex:1,background:"#1B4332",border:"1px solid #D4A843",borderRadius:12,padding:"14px",color:"#D4A843",fontWeight:800,fontSize:13,cursor:"pointer",lineHeight:1.4}}>10 000/an<br/><span style={{fontSize:10}}>(-17%)</span></button>
          </div>
          <button onClick={onPayCinetPay} disabled={payBusy} style={{width:"100%",background:"#0A1A0F",border:"1px solid #D4A843",borderRadius:12,padding:"13px",color:"#D4A843",fontWeight:800,fontSize:13,cursor:"pointer",marginBottom:12}}>{payBusy?"Ouverture du paiement...":"💳 Payer en ligne maintenant (Orange Money / Wave / Carte)"}</button>
          <div style={{background:"#0A1A0F",borderRadius:12,padding:12}}>
            <p style={{margin:"0 0 8px",color:"#6B7280",fontSize:11,fontWeight:700}}>OU MANUELLEMENT VIA WHATSAPP :</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Orange Money</button>
              <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"10px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"}}>Wave</button>
            </div>
            <p style={{color:"#6B7280",fontSize:10,textAlign:"center",margin:"8px 0 0"}}>+223 76 90 80 31 (Orange) - +223 90 64 71 06 (Wave)</p>
          </div>
        </div>}
        {[
          ...(user.role==="admin"?[{label:"ADMINISTRATION",items:[{ic:"🛡️",lb:t("panneauAdmin"),fn:onOpenAdmin}]}]:[]),
          {label:"NOTIFICATIONS",items:[{key:"notif",ic:"🔔",lb:t("notifications"),fn:toggleNotifications,toggle:notifOn,busy:notifBusy}]},
          {label:"COMPTE",items:[{ic:"🔒",lb:t("changerPin"),fn:()=>onToast("Bientot disponible")},{ic:"📲",lb:t("lierWA"),fn:()=>window.open("https://wa.me/22376908031","_blank")}]},
          {label:"DONNEES ET AIDE",items:[{ic:"📤",lb:t("exporterDonnees"),fn:exporterDonnees},{ic:"💬",lb:t("contacterSupport"),fn:()=>setShowSupport(true)}]},
        ].map(group=>(
          <div key={group.label} style={{marginBottom:18}}>
            <p style={{color:"#6B7280",fontSize:11,fontWeight:700,marginBottom:10,letterSpacing:.5}}>{group.label}</p>
            {group.items.map(item=>(
              <div key={item.key||item.lb} onClick={item.toggle===undefined?item.fn:undefined} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"#0F2419",borderRadius:14,marginBottom:8,cursor:item.toggle===undefined?"pointer":"default",border:"1px solid #1B4332",opacity:item.busy?0.7:1}}>
                <span style={{fontSize:20}}>{item.ic}</span><p style={{margin:0,color:"#FDF6EC",fontSize:14,fontWeight:600}}>{item.lb}</p>
                {item.toggle===undefined
                  ?<span style={{marginLeft:"auto",color:"#2D6A4F",fontSize:18}}>›</span>
                  :<div onClick={item.busy?undefined:item.fn} style={{marginLeft:"auto",width:46,height:26,borderRadius:99,background:item.toggle?"#D4A843":"#2D6A4F",position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
                      <div style={{position:"absolute",top:3,left:item.toggle?23:3,width:20,height:20,borderRadius:"50%",background:"#FDF6EC",transition:"left .2s"}}/>
                    </div>}
              </div>
            ))}
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

const CagnotteScreen = ({cagnotte:cInit,onBack,onToast,onUpdate,onDelete}) => {
  const [cagnotte,setCagnotte]=useState(cInit);
  const [contributions,setContributions]=useState([]);
  const [showContrib,setShowContrib]=useState(false);
  const [nom,setNom]=useState("");
  const [montant,setMontant]=useState("");
  const [busy,setBusy]=useState(false);

  const loadContribs=async()=>{
    const {data}=await supabase.from("cagnotte_contributions").select("*").eq("cagnotte_id",cagnotte.id).order("created_at",{ascending:false});
    setContributions(data||[]);
  };
  useEffect(()=>{loadContribs();},[cagnotte.id]);

  const pct=Math.min(100,Math.round((cagnotte.montant_collecte/cagnotte.objectif)*100));

  const ajouterContribution=async()=>{
    if(!nom.trim())return onToast("Nom du contributeur requis","error");
    if(!montant||Number(montant)<1)return onToast("Montant invalide","error");
    setBusy(true);
    const amt=Number(montant);
    const {data,error}=await supabase.from("cagnotte_contributions").insert({cagnotte_id:cagnotte.id,contributeur:s(nom.trim()),montant:amt}).select().single();
    if(error){setBusy(false);return onToast("Ajout impossible","error");}
    const nouveauTotal=cagnotte.montant_collecte+amt;
    await supabase.from("cagnottes").update({montant_collecte:nouveauTotal}).eq("id",cagnotte.id);
    setBusy(false);
    setContributions(c=>[data,...c]);
    setCagnotte(c=>({...c,montant_collecte:nouveauTotal}));
    onUpdate(cagnotte.id,{montant_collecte:nouveauTotal});
    setNom("");setMontant("");setShowContrib(false);
    onToast("Contribution enregistree !");
  };

  const cloturer=async()=>{
    const {error}=await supabase.from("cagnottes").update({statut:"cloturee"}).eq("id",cagnotte.id);
    if(error)return onToast("Impossible de cloturer","error");
    setCagnotte(c=>({...c,statut:"cloturee"}));
    onUpdate(cagnotte.id,{statut:"cloturee"});
    onToast("Cagnotte cloturee !");
  };

  const supprimer=async()=>{
    if(!confirm("Supprimer cette cagnotte definitivement ?"))return;
    const {error}=await supabase.from("cagnottes").delete().eq("id",cagnotte.id);
    if(error)return onToast("Suppression impossible","error");
    onDelete(cagnotte.id);
  };

  const partager=()=>{
    const msg=encodeURIComponent(`🎉 ${cagnotte.titre}\n\n${cagnotte.description||""}\n\nObjectif : ${fmtFCFA(cagnotte.objectif)}\nDeja collecte : ${fmtFCFA(cagnotte.montant_collecte)} (${pct}%)\n\nParticipe si tu peux, merci !`);
    window.open(`https://wa.me/?text=${msg}`,"_blank");
  };

  return(
    <div style={{paddingBottom:90}}>
      <div style={{padding:"44px 16px 0",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:"#D4A843",fontSize:22,cursor:"pointer"}}>←</button>
        <div style={{flex:1}}><h2 style={{color:"#FDF6EC",margin:0,fontSize:17,fontWeight:800}}>{cagnotte.titre}</h2>{cagnotte.beneficiaire&&<p style={{color:"#D4A843",margin:0,fontSize:12}}>Pour : {cagnotte.beneficiaire}</p>}</div>
        <button onClick={supprimer} style={{background:"transparent",border:"1px solid #C1440E",borderRadius:8,padding:"5px 10px",color:"#EF4444",fontSize:11,fontWeight:700,cursor:"pointer"}}>Suppr.</button>
      </div>
      {cagnotte.description&&<p style={{color:"#6B7280",fontSize:13,padding:"12px 16px 0",lineHeight:1.6}}>{cagnotte.description}</p>}
      <div style={{margin:"16px 16px 0",background:"#0F2419",border:"1px solid #D4A843",borderRadius:16,padding:18}}>
        <p style={{margin:0,color:"#6B7280",fontSize:12,fontWeight:600}}>COLLECTE</p>
        <p style={{margin:"4px 0 0",color:"#D4A843",fontSize:26,fontWeight:900}}>{fmtFCFA(cagnotte.montant_collecte)}</p>
        <Bar pct={pct} c="#D4A843"/>
        <p style={{margin:"6px 0 0",color:"#6B7280",fontSize:11}}>Objectif : {fmtFCFA(cagnotte.objectif)} ({pct}%){cagnotte.date_limite?` - avant le ${new Date(cagnotte.date_limite).toLocaleDateString("fr-FR")}`:""}</p>
      </div>
      {cagnotte.statut!=="cloturee"&&<div style={{display:"flex",gap:10,padding:"14px 16px 0"}}>
        <button onClick={()=>setShowContrib(true)} style={{flex:1,background:"#1B4332",border:"1px solid #2D6A4F",borderRadius:10,padding:"11px",color:"#D4A843",fontWeight:700,fontSize:13,cursor:"pointer"}}>+ Contribution</button>
        <button onClick={partager} style={{flex:1,background:"#075E54",border:"none",borderRadius:10,padding:"11px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Partager WA</button>
      </div>}
      {cagnotte.statut!=="cloturee"&&<button onClick={cloturer} style={{width:"calc(100% - 32px)",margin:"10px 16px 0",background:"transparent",border:"1px solid #2D6A4F",borderRadius:10,padding:"10px",color:"#6B7280",fontWeight:700,fontSize:12,cursor:"pointer"}}>Cloturer la cagnotte</button>}
      <div style={{padding:"20px 16px 0"}}>
        <p style={{color:"#6B7280",fontSize:12,fontWeight:700,margin:"0 0 10px",letterSpacing:.5}}>CONTRIBUTIONS ({contributions.length})</p>
        {contributions.length===0?<p style={{color:"#6B7280",fontSize:13,textAlign:"center",padding:10}}>Aucune contribution pour l instant</p>
        :contributions.map(c=>(
          <div key={c.id} style={{background:"#0F2419",border:"1px solid #1B4332",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}><Avatar prenom={c.contributeur} size={32}/><p style={{margin:0,color:"#FDF6EC",fontSize:14,fontWeight:600}}>{c.contributeur}</p></div>
            <p style={{margin:0,color:"#D4A843",fontWeight:700,fontSize:14}}>{fmtFCFA(c.montant)}</p>
          </div>
        ))}
      </div>
      {showContrib&&<Modal onClose={()=>setShowContrib(false)}>
        <MH title="Nouvelle contribution" onClose={()=>setShowContrib(false)}/>
        <Fld label="Nom du contributeur"><Inp value={nom} onChange={e=>setNom(e.target.value)} placeholder="Ex: Fatoumata" maxLength={40} autoFocus/></Fld>
        <Fld label="Montant (FCFA)"><Inp value={montant} onChange={e=>setMontant(e.target.value.replace(/\D/g,""))} placeholder="Ex: 5000" inputMode="numeric"/></Fld>
        <Btn onClick={ajouterContribution} disabled={busy}>{busy?"Enregistrement...":"Ajouter"}</Btn>
      </Modal>}
    </div>
  );
};

const ModalCreerCagnotte = ({onClose,onCreate,user}) => {
  const [titre,setTitre]=useState("");
  const [description,setDescription]=useState("");
  const [objectif,setObjectif]=useState("");
  const [beneficiaire,setBeneficiaire]=useState("");
  const [dateLimite,setDateLimite]=useState("");
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState("");

  const handle=async()=>{
    if(!titre.trim())return setErr("Donne un titre a ta cagnotte");
    if(!objectif||Number(objectif)<1000)return setErr("Objectif minimum 1000 FCFA");
    setBusy(true);
    const payload={user_id:user.id,titre:s(titre.trim()),description:s(description||""),objectif:Number(objectif),beneficiaire:s(beneficiaire||""),date_limite:dateLimite||null,montant_collecte:0};
    const {data,error}=await supabase.from("cagnottes").insert(payload).select().single();
    setBusy(false);
    if(error)return setErr("Erreur technique : "+(error.message||"inconnue"));
    onCreate(data);
    onClose();
  };

  return(
    <Modal onClose={onClose}>
      <MH title="Nouvelle cagnotte" onClose={onClose}/>
      <Fld label="Titre"><Inp value={titre} onChange={e=>setTitre(e.target.value)} placeholder="Ex: Mariage de Fatoumata" maxLength={60} autoFocus/></Fld>
      <Fld label="Pour qui (beneficiaire)"><Inp value={beneficiaire} onChange={e=>setBeneficiaire(e.target.value)} placeholder="Ex: Fatoumata Diallo" maxLength={60}/></Fld>
      <Fld label="Description (optionnel)"><textarea value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Details de l occasion..." style={{width:"100%",background:"#1A2E1F",border:"1px solid #2D6A4F",borderRadius:12,padding:"12px 14px",color:"#FDF6EC",fontSize:14,outline:"none",resize:"vertical",fontFamily:"inherit"}}/></Fld>
      <Fld label="Objectif (FCFA)"><Inp value={objectif} onChange={e=>setObjectif(e.target.value.replace(/\D/g,""))} placeholder="Ex: 200000" inputMode="numeric"/></Fld>
      <Fld label="Date limite (optionnel)"><Inp value={dateLimite} onChange={e=>setDateLimite(e.target.value)} type="date"/></Fld>
      <ErrBox msg={err}/>
      <Btn onClick={handle} disabled={busy}>{busy?"Creation...":"Creer la cagnotte"}</Btn>
    </Modal>
  );
};

const ModalCreer = ({onClose,onCreate,user}) => {
  const [nom,setNom]=useState("");
  const [montant,setMontant]=useState("");
  const [freq,setFreq]=useState("Mensuel");
  const [echeance,setEcheance]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [limitReached,setLimitReached]=useState(false);
  const [payBusy,setPayBusy]=useState(false);
  const handle=async()=>{
    if(!nom.trim())return setErr("Donne un nom a ta tontine");
    if(!montant||Number(montant)<500)return setErr("Montant minimum : 500 FCFA");
    if(user.plan==="free"&&user.groupesCount>=1){setErr("");setLimitReached(true);return;}
    setBusy(true);
    const payload={user_id:user.id,owner_id:user.id,nom:s(nom.trim()),montant:Number(montant),frequence:freq,couleur:"#D4A843",cycle:1,total_cycles:12,date_echeance:echeance||new Date(Date.now()+30*86400000).toISOString().split("T")[0],caisse_sociale:0};
    const {data,error}=await supabase.from("groupes").insert(payload).select().single();
    if(error){setBusy(false);return setErr("Erreur technique : "+(error.message||"inconnue"));}
    const {data:moi}=await supabase.from("membres").insert({groupe_id:data.id,prenom:s(user.prenom)+" (moi)",tel:user.tel,quartier:"",photo_url:user.photo||null,paye:false,score:80,versements:0,cycles_paies:0,ordre:0,user_id:user.id}).select().single();
    setBusy(false);
    const moiMembre=moi?{id:moi.id,userId:user.id,prenom:moi.prenom,tel:moi.tel,quartier:"",photo:moi.photo_url,paye:false,score:80,versements:0,cyclesPaies:0,cyclesTotal:12,evenement:null}:null;
    onCreate({id:data.id,nom:data.nom,montant:Number(data.montant),frequence:data.frequence,couleur:data.couleur,cycle:data.cycle,totalCycles:data.total_cycles,dateEcheance:data.date_echeance,caisseSociale:0,cagnotte:0,prochainTour:"-",membres:moiMembre?[moiMembre]:[],checklist:[],messages:[]});
    onClose();
  };
  if(limitReached)return <Modal onClose={onClose}>
    <MH title="Limite atteinte" onClose={onClose}/>
    <div style={{textAlign:"center",padding:"10px 0 4px"}}><p style={{fontSize:40,margin:0}}>🔒</p></div>
    <p style={{color:"#FDF6EC",fontSize:15,fontWeight:700,textAlign:"center",margin:"8px 0 4px"}}>1 tontine geree, c'est le maximum en gratuit</p>
    <p style={{color:"#6B7280",fontSize:13,textAlign:"center",lineHeight:1.6,marginBottom:20}}>Passe a HABY Premium pour gerer plusieurs tontines en meme temps.</p>
    <button onClick={async()=>{
      setPayBusy(true);
      const {data,error}=await supabase.functions.invoke("cinetpay-init",{});
      setPayBusy(false);
      if(error||data?.error)return setErr("Erreur : "+(data?.error||error?.message||"paiement indisponible"));
      if(data?.payment_url)window.open(data.payment_url,"_blank");
    }} disabled={payBusy} style={{width:"100%",background:"linear-gradient(135deg,#D4A843,#B8922E)",border:"none",borderRadius:12,padding:"13px",color:"#0A1A0F",fontWeight:800,fontSize:14,cursor:"pointer",marginBottom:12}}>{payBusy?"Ouverture du paiement...":"💳 Payer en ligne maintenant - 1 000 FCFA"}</button>
    <p style={{color:"#6B7280",fontSize:11,textAlign:"center",margin:"0 0 12px"}}>OU manuellement via WhatsApp :</p>
    <div style={{display:"flex",gap:10}}>
      <button onClick={()=>window.open("https://wa.me/22376908031?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#FF6600",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Orange Money</button>
      <button onClick={()=>window.open("https://wa.me/22390647106?text=Je%20veux%20HABY%20Premium","_blank")} style={{flex:1,background:"#0066CC",border:"none",borderRadius:10,padding:"12px",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Wave</button>
    </div>
    <ErrBox msg={err}/>
  </Modal>;
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
  const [deepLink,setDeepLink]=useState(null);
  const [cagnottes,setCagnottes]=useState([]);
  const [selCagnotte,setSelCagnotte]=useState(null);
  const [showCagnotteModal,setShowCagnotteModal]=useState(false);
  const [adminUnlocked,setAdminUnlocked]=useState(false);
  const [showPinConfirm,setShowPinConfirm]=useState(false);
  const [pinConfirm,setPinConfirm]=useState("");
  const [pinConfirmBusy,setPinConfirmBusy]=useState(false);
  const [pinConfirmErr,setPinConfirmErr]=useState("");

  const showToast=useCallback((msg,type)=>setToast({msg,type}),[]);

  const changeLang=useCallback(async(l)=>{
    setAppLang(l);setLang(l);
    if(user)await supabase.from("users").update({langue:l}).eq("id",user.id);
  },[user]);

  const loadCagnottes=useCallback(async(uid)=>{
    const {data,error}=await supabase.from("cagnottes").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(!error)setCagnottes(data||[]);
  },[]);

  const loadParticipations=useCallback(async(uid)=>{
    const {data:mine,error}=await supabase.from("membres").select("*").eq("user_id",uid);
    if(error||!mine||mine.length===0){setParticipations([]);return;}
    const groupeIds=[...new Set(mine.map(m=>m.groupe_id))];
    const {data:gs}=await supabase.from("groupes").select("*").in("id",groupeIds);
    const full=await Promise.all((gs||[]).map(async g=>{
      const {data:membres}=await supabase.from("membres").select("*").eq("groupe_id",g.id).order("ordre",{ascending:true});
      const {data:checklist}=await supabase.from("checklist").select("*").eq("groupe_id",g.id).order("created_at",{ascending:true});
      const {data:tirages}=await supabase.from("tirages").select("*").eq("groupe_id",g.id).order("cycle",{ascending:true});
      const {data:elections}=await supabase.from("elections").select("*").eq("groupe_id",g.id).eq("statut","ouverte");
      const {data:mesVotes}=await supabase.from("votes").select("*").eq("voter_user_id",uid);
      const {data:prets}=await supabase.from("prets").select("*").eq("groupe_id",g.id).order("created_at",{ascending:false});
      const {data:rapports}=await supabase.from("rapports_reunion").select("*").eq("groupe_id",g.id).order("date_reunion",{ascending:false});
      const {data:createur}=await supabase.from("users").select("id,prenom,photo_url").eq("id",g.user_id).single();
      const moi=mine.find(m=>m.groupe_id===g.id);
      const aJourCount=(membres||[]).filter(m=>m.paye).length;
      return {
        id:g.id,nom:g.nom,montant:Number(g.montant)||0,frequence:g.frequence||"Mensuel",couleur:g.couleur||"#D4A843",
        cycle:g.cycle||1,totalCycles:g.total_cycles||12,reglement:g.reglement||"",
        caisseSociale:Number(g.caisse_sociale)||0,cagnotte:aJourCount*(Number(g.montant)||0),
        createurUserId:g.user_id,createurNom:createur?.prenom||"Creatrice",createurPhoto:createur?.photo_url||null,
        membres:(membres||[]).map(m=>({id:m.id,userId:m.user_id,prenom:m.prenom,paye:m.paye,quartier:m.quartier,photo:m.photo_url,evenement:m.evenement,versements:Number(m.versements)||0,role_bureau:m.role_bureau})),
        checklist:(checklist||[]).map(c=>({id:c.id,label:c.label,done:c.done})),
        tirages:tirages||[],
        elections:(elections||[]).map(e=>({...e,dejaVote:(mesVotes||[]).some(v=>v.election_id===e.id)})),
        prets:prets||[],
        rapports:rapports||[],
        moi:moi?{versements:Number(moi.versements)||0,paye:moi.paye,cyclesPaies:moi.cycles_paies||0}:null,
      };
    }));
    setParticipations(full);
    return full;
  },[]);

  const loadGroupes=useCallback(async(uid)=>{
    const {data:gs,error}=await supabase.from("groupes").select("*").eq("user_id",uid).order("created_at",{ascending:false});
    if(error){showToast("Erreur de chargement des tontines","error");return;}
    const full=await Promise.all((gs||[]).map(async g=>{
      const {data:membres}=await supabase.from("membres").select("*").eq("groupe_id",g.id).order("ordre",{ascending:true});
      const {data:checklist}=await supabase.from("checklist").select("*").eq("groupe_id",g.id).order("created_at",{ascending:true});
      const {data:tirageActuel}=await supabase.from("tirages").select("*").eq("groupe_id",g.id).eq("cycle",g.cycle||1).maybeSingle();
      const mm=(membres||[]).map(m=>({id:m.id,userId:m.user_id,prenom:m.prenom,tel:m.tel,quartier:m.quartier,photo:m.photo_url,paye:m.paye,evenement:m.evenement,score:m.score??80,versements:Number(m.versements)||0,cyclesPaies:m.cycles_paies||0,cyclesTotal:(g.total_cycles||12)-(g.cycle||1)+1}));
      const aJourCount=mm.filter(m=>m.paye).length;
      const gagnant=tirageActuel?mm.find(m=>m.id===tirageActuel.membre_id):null;
      return {
        id:g.id,nom:g.nom,montant:Number(g.montant)||0,frequence:g.frequence||"Mensuel",couleur:g.couleur||"#D4A843",
        cycle:g.cycle||1,totalCycles:g.total_cycles||12,dateEcheance:g.date_echeance,reglement:g.reglement||"",
        caisseSociale:Number(g.caisse_sociale)||0,cagnotte:aJourCount*(Number(g.montant)||0),
        prochainTour:gagnant?gagnant.prenom:"A tirer au sort",
        membres:mm,
        checklist:(checklist||[]).map(c=>({id:c.id,label:c.label,done:c.done})),
        messages:[],
      };
    }));
    setGroupes(full);
    return full;
  },[showToast]);

  const openFromUrl=(search,gs,parts)=>{
    const params=new URLSearchParams(search);
    const gid=params.get("g");
    if(!gid)return false;
    const tab=params.get("tab")||undefined;
    const dm=params.get("dm");
    const dmName=params.get("dmName");
    const thread=dm?{userId:dm,prenom:dmName?decodeURIComponent(dmName):"Contact"}:null;
    const owned=(gs||[]).find(g=>g.id===gid);
    if(owned){setDeepLink({tab,thread});setSel(owned);setNav("home");return true;}
    const part=(parts||[]).find(g=>g.id===gid);
    if(part){setDeepLink({tab,thread});setSelPart(part);setNav("home");return true;}
    return false;
  };

  const userRef=useRef(null);
  useEffect(()=>{userRef.current=user;},[user]);
  useEffect(()=>{
    if(!("serviceWorker" in navigator))return;
    const handler=async(event)=>{
      if(event.data?.type!=="NAVIGATE")return;
      const u=userRef.current;
      if(!u)return;
      const [gs,parts]=await Promise.all([loadGroupes(u.id),loadParticipations(u.id)]);
      const url=new URL(event.data.url,window.location.origin);
      openFromUrl(url.search,gs,parts);
    };
    navigator.serviceWorker.addEventListener("message",handler);
    return()=>navigator.serviceWorker.removeEventListener("message",handler);
  },[]);

  useEffect(()=>{
    (async()=>{
      const sessionUser=await getSession();
      if(sessionUser){
        setUser(sessionUser);setAppLang(sessionUser.langue||"fr");setLang(sessionUser.langue||"fr");
        const [gs,parts]=await Promise.all([loadGroupes(sessionUser.id),loadParticipations(sessionUser.id),loadCagnottes(sessionUser.id)]);
        openFromUrl(window.location.search,gs,parts);
      }
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

  if(!user)return <AuthScreen onLogin={async(u)=>{setUser(u);setAppLang(u.langue||"fr");setLang(u.langue||"fr");await Promise.all([loadGroupes(u.id),loadParticipations(u.id),loadCagnottes(u.id)]);if(u.linkedCount>0)showToast(`Bienvenue ! Tu as ete ajoute(e) a ${u.linkedCount} tontine(s) !`);}}/>;
  const cu={...user,groupesCount:groupes.length};
  const NAV=[["home","🏠",t("accueil")],["epargne","🏺",t("epargne")],["haby","🤖","HABY"],["profil","👤",t("profil")]];

  return(
    <div style={{background:"#0A1A0F",minHeight:"100vh",maxWidth:440,margin:"0 auto",position:"relative",display:"flex",flexDirection:"column"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');*{box-sizing:border-box;font-family:'Plus Jakarta Sans',sans-serif;}::-webkit-scrollbar{width:0;height:0;}input{-webkit-appearance:none;}input::placeholder{color:#2D6A4F;}`}</style>
      <div style={{flex:1,overflowY:"auto",paddingBottom:nav==="haby"?0:72}}>
        {selCagnotte?<CagnotteScreen cagnotte={selCagnotte} onBack={()=>setSelCagnotte(null)} onToast={showToast} onUpdate={(id,upd)=>{setCagnottes(cs=>cs.map(c=>c.id===id?{...c,...upd}:c));setSelCagnotte(c=>c&&c.id===id?{...c,...upd}:c);}} onDelete={(id)=>{setCagnottes(cs=>cs.filter(c=>c.id!==id));setSelCagnotte(null);}}/>
        :selPart?<ParticipationScreen groupe={selPart} deepLink={deepLink} onBack={()=>{setSelPart(null);setDeepLink(null);}} user={cu} onToast={showToast} onVoted={()=>loadParticipations(cu.id)}/>
        :sel?<GroupeScreen groupe={sel} deepLink={deepLink} onBack={()=>{setSel(null);setDeepLink(null);loadGroupes(cu.id);loadParticipations(cu.id);}} onToast={showToast} user={cu} onDeleteGroupe={(gid)=>{setGroupes(gs=>gs.filter(g=>g.id!==gid));setSel(null);}} onUpdateGroupe={(gid,upd)=>{setGroupes(gs=>gs.map(g=>g.id===gid?{...g,...upd}:g));setSel(s=>s&&s.id===gid?{...s,...upd}:s);}}/>
        :nav==="home"?<HomeScreen user={cu} groupes={groupes} onSelectGroupe={(g)=>{setDeepLink(null);setSel(g);}} onCreer={()=>setShowC(true)} onProfil={()=>setNav("profil")} participations={participations} onSelectParticipation={(g)=>{setDeepLink(null);setSelPart(g);}} cagnottes={cagnottes} onCreerCagnotte={()=>setShowCagnotteModal(true)} onSelectCagnotte={setSelCagnotte}/>
        :nav==="epargne"?<EpargneScreen onToast={showToast} user={cu}/>
        :nav==="haby"?<HabyScreen groupes={groupes}/>
        :nav==="admin"?<AdminScreen onBack={()=>setNav("profil")} onToast={showToast} currentUserId={cu.id}/>
        :nav==="profil"?<ProfilScreen user={cu} onLogout={handleLogout} onToast={showToast} onUpgrade={()=>showToast("Envoie ton paiement et contacte le support WhatsApp","warn")} onOpenAdmin={()=>{if(adminUnlocked){setNav("admin");}else{setPinConfirm("");setPinConfirmErr("");setShowPinConfirm(true);}}} lang={lang} onChangeLang={changeLang}/>:null}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:440,background:"#0F2419",borderTop:"1px solid #1B4332",display:"flex",padding:"8px 0 20px",zIndex:100}}>
        {NAV.map(([id,icon,lbl])=><button key={id} onClick={()=>{setSel(null);setNav(id);}} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",color:nav===id&&!sel?"#D4A843":"#6B7280",cursor:"pointer",padding:"4px 0",gap:3}}><span style={{fontSize:22}}>{icon}</span><span style={{fontSize:10,fontWeight:600}}>{lbl}</span></button>)}
      </div>
      {showC&&<ModalCreer onClose={()=>setShowC(false)} onCreate={g=>{setGroupes(p=>[...p,g]);showToast("Tontine creee !");}} user={cu}/>}
      {showCagnotteModal&&<ModalCreerCagnotte onClose={()=>setShowCagnotteModal(false)} onCreate={c=>{setCagnottes(cs=>[c,...cs]);showToast("Cagnotte creee !");}} user={cu}/>}
      {showPinConfirm&&<Modal onClose={()=>setShowPinConfirm(false)}>
        <MH title="Confirme ton PIN" onClose={()=>setShowPinConfirm(false)}/>
        <p style={{color:"#6B7280",fontSize:13,marginBottom:16,lineHeight:1.6}}>Pour proteger le panneau administrateur, entre a nouveau ton code PIN.</p>
        <Fld label="Code PIN"><Inp value={pinConfirm} onChange={e=>setPinConfirm(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="****" type="password" inputMode="numeric" maxLength={4} autoFocus/></Fld>
        <ErrBox msg={pinConfirmErr}/>
        <Btn onClick={async()=>{
          if(pinConfirm.length!==4)return setPinConfirmErr("Le PIN doit faire 4 chiffres");
          setPinConfirmBusy(true);
          const ok=await verifyPin(cu.tel,pinConfirm);
          setPinConfirmBusy(false);
          if(!ok)return setPinConfirmErr("PIN incorrect");
          setAdminUnlocked(true);setShowPinConfirm(false);setNav("admin");
        }} disabled={pinConfirmBusy}>{pinConfirmBusy?"Verification...":"Confirmer"}</Btn>
      </Modal>}
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}
