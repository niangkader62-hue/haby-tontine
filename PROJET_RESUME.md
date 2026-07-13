# THT (Tontine Habi Traore) — Etat complet du projet

## Contexte
App PWA de gestion de tontines, cagnottes solidaires et epargne pour l'Afrique de l'Ouest francophone (Mali principalement). Nommee en hommage a Habi Traore, la mere de Kader (proprietaire/createur, non-developpeur). Stack : React + Vite (frontend), Supabase (base de donnees + fonctions serveur + stockage), Netlify (hebergement, deploiement automatique sur push vers `main`).

Kader ne code pas lui-meme. Un assistant Claude ecrit tout le code, commit et pousse directement sur GitHub avec un token temporaire fourni par Kader a chaque session. Kader teste sur Android, communique via captures d'ecran. Un autre assistant (Claude Code, installe sur son ordinateur) travaille aussi en parallele sur le meme depot -- coordination a faire entre les deux pour eviter les conflits.

Depot : `niangkader62-hue/haby-tontine`. Site : `https://haby-tontine.netlify.app`.

## Fonctionnalites (toutes construites et deployees)

**Tontines**
- Creation, gestion des membres, cotisations a montant standard ou personnalise par membre (0 FCFA = membre exempte, bug corrige -- avant traite comme "pas de montant personnalise")
- Marquage paye/non paye (bouton rapide "Marquer paye" desormais coherent avec le versement normal), historique des versements avec photo de preuve
- Tirage au sort du gagnant de chaque cycle (contrainte anti-doublon en base)
- Bouton "Cloturer le cycle" -- avant, une tontine restait bloquee indefiniment sur cycle 1, aucun moyen de progresser. Corrige : incremente le cycle, reinitialise les paiements, notifie les membres
- Bureau (president/tresoriere/secretaire), elections
- Prets : le membre demande (uniquement dans sa propre tontine, en son nom), la creatrice accepte (avec taux d'interet + date d'echeance + photo de preuve) ou refuse, suivi du remboursement. Messages d'erreur precis sur echec.
- Checklist de suivi (onglet "Suivi") : montant recu / recu envoye / dette / photo, par versement, avec bouton "Tout est en ordre". Role "collecteur" delegable a 1-2 membres pour aider a la collecte (droits limites).
- Caisse sociale : fonds separe des cotisations, ajout/retrait avec motif, historique visible **par la creatrice ET par les membres** (avant : membre ne voyait que le solde)
- Messagerie de groupe + privee, notifications push en temps reel
- Rapports de reunion, taches (checklist cliquable cote membre aussi, pas que la creatrice), evenements (mariage/naissance/deces -- maintenant visible cote membre, avant totalement absent)
- Export PDF (rapport) et CSV/Excel (donnees completes)
- Transparence : le membre voit tout ce que voit la creatrice (budget, qui a paye/qui est en retard, bureau, reglement, comptes-rendus, prets, tirages, taches, evenements, caisse sociale) sans pouvoir modifier -- sauf cocher ses propres taches

**Cagnottes solidaires**
- Creation (mariage, sante, funerailles, etudes...), lien de contribution PUBLIC (sans compte requis), formulaire prenom/nom/telephone/montant, photo de preuve obligatoire
- Incrementation atomique du montant collecte (evite qu'une contribution "disparaisse" si deux arrivent en meme temps)
- Notification automatique a la creatrice a chaque contribution
- Bouton "Notifier un groupe" : push automatique aux membres lies, lien WhatsApp pre-rempli pour les autres

**Epargne personnelle** ("Ma Tirelire") : objectifs d'epargne individuels

**Compte et securite**
- Inscription/connexion par numero de telephone + PIN 4 chiffres (Supabase Auth, PIN transforme en mot de passe)
- Selecteur de pays avec indicatif et recherche : 40 pays (Afrique de l'Ouest/Nord/Centre, France, Etats-Unis/Canada, Espagne, et bien d'autres)
- Changement de PIN (Profil + Panneau Admin)
- Tutoriel de bienvenue a l'inscription (4 ecrans)
- Notifications push (VAPID), rappels automatiques quotidiens (cron Supabase 8h Bamako : J-1, jour J, retard tous les 3 jours)
- Bouton retour Android (historique navigateur) qui navigue dans l'app au lieu de la fermer

**Panneau Administrateur**
- Tableau de bord (utilisateurs, tontines, paiements)
- Remise a zero complete des donnees de test : proteges par 2 codes de securite personnalises (definis par Kader lui-meme) + mot "SUPPRIMER", **verifies cote serveur** (avant : uniquement cote app, contournable). Proteges automatiquement : les 2 vrais numeros admin de Kader.
- **PROBLEME NON RESOLU** : Kader rapporte que la suppression "refuse encore" malgre plusieurs corrections. Cause exacte inconnue -- en attente d'une capture d'ecran precise du comportement pour diagnostiquer. Le code cote serveur a ete relu plusieurs fois sans trouver de bug evident. Prochaine etape : obtenir une capture d'ecran du moment exact ou ca "refuse".

**HABY (assistante IA dans l'app)**
- Basee sur Gemini (edge function `haby-chat`), GEMINI_API_KEY configuree
- Corrige : limite de reponse augmentee (500 -> 2048 tokens, causait des coupures) et connaissance complete de toutes les fonctionnalites de l'app (avant : seulement les tontines de base, ne savait rien des prets/checklist/cagnottes/etc.)

**Design**
- Palette orange/noir (changee depuis vert/or sur decision EXPLICITE de Kader, malgre le risque de ressemblance avec Orange Money qui lui a ete signale clairement avant qu'il confirme)
- Police Inter
- Bandeau carrousel promotionnel sur l'accueil, auto-defilant, cliquable (renvoie vers parrainage/creation cagnotte/HABY)
- Menu "Plus" en grille d'icones (style Orange Money)
- Logo actuel (H+T dore/vert) pas encore adapte au nouveau theme orange/noir -- a signaler si Kader veut un nouveau logo assorti

**Fiabilite**
- Error Boundary React : si l'app plante, affiche le vrai message d'erreur + bouton retour, au lieu d'un ecran fige. A permis de diagnostiquer et corriger le bug le plus grave de la session (variables non definies causant un plantage total de l'onglet Message)
- Audit ESLint (regle no-undef) mis en place -- zero variable non definie dans tout le fichier au dernier controle
- Performance : bundle JS principal divise par 2 (jsPDF et html2canvas charges a la demande, pas au demarrage)
- Un audit plus approfondi (logique metier + securite RLS) a ete mene en parallele par Claude Code sur l'ordinateur de Kader ; les corrections identifiees ont ete reproduites ici (voir liste ci-dessus : cycle, montant 0, securite reset, marquer paye, cagnotte atomique)

## Fonctions serveur (Supabase Edge Functions)
- `send-push` : notifications push
- `daily-reminders` : rappels quotidiens automatiques (cron)
- `haby-chat` : assistante IA HABY (Gemini)
- `cinetpay-init` / `cinetpay-webhook` : paiement en ligne -- **PAS CONFIGURE**, cle CinetPay manquante
- `cagnotte-contribute` : point d'entree public (sans authentification) pour les contributions de cagnotte, increment atomique
- `admin-reset-data` : remise a zero, verifie role admin + 2 codes de securite cote serveur, journal de diagnostic detaille retourne a l'app

## Scripts SQL -- statut
De nombreux scripts ont ete donnes au fil de la session. Le plus recent et le plus complet est `supabase_rattrapage_final.sql` dans le depot, complete ensuite par les policies `checklist_update`, `tirages_un_par_cycle` (contrainte unique), `increment_cagnotte` (fonction), et `prets_update`. **Il est fortement recommande de relire tous les fichiers `supabase_*.sql` du depot et de rejouer un script consolide complet pour etre certain que rien ne manque**, plutot que de supposer que tout a ete execute -- Kader a eu plusieurs confusions sur quels scripts avaient reellement ete lances.

## Discipline de deploiement
Netlify facture au credit (15 credits/deploiement, quel que soit le volume de changement). Regle etablie avec Kader : grouper les changements, obtenir son accord avant de pousser -- SAUF urgence de diagnostic necessitant un test en direct immediat (auquel cas on deploie pour observer le resultat). Un incident anterieur a epuise 1000 credits en une journee a cause de deploiements trop frequents ; Kader a du acheter un pack de credits supplementaires (500 credits, 5$) pour debloquer le site apres une pause forcee par Netlify ("Site not available").

## Ce qui reste a faire (par priorite)
1. **Diagnostiquer pourquoi la remise a zero admin "refuse" encore** -- necessite une capture d'ecran precise de Kader
2. **CinetPay** : creation du compte marchand par Kader (cinetpay.com), puis integration reelle -- prochaine grosse etape apres la fin des correctifs
3. Suivi de la caisse sociale par membre individuel (actuellement solde global gere par la creatrice uniquement)
4. Archive consultable des recus envoyes
5. Logo assorti au nouveau theme orange/noir (optionnel, a demander a Kader)
6. Renommage du sous-domaine Netlify
7. Passe complete d'accents francais dans le code (texte simplifie par endroits)
8. Aucun vrai utilisateur externe n'a encore teste l'app -- 0 utilisateur reel a ce jour, un test reel avec un vrai contact est recommande avant le lancement

## Notes pour la prochaine conversation
- Toujours lire les fichiers `SKILL.md` pertinents avant toute tache de creation de fichier
- Toujours faire `npm run build` ET `npx eslint src/App.jsx --no-eslintrc -c .eslintrc.cjs 2>&1 | grep -E "no-undef|no-redeclare"` avant de pousser -- cette combinaison a permis d'eliminer la quasi-totalite des bugs de plantage cette session
- Kader communique en francais, teste sur Android via Chrome, souvent via captures d'ecran (parfois de mauvaise qualite/sombres) -- demander une description texte si une capture n'est pas claire plutot que de deviner
- Toujours donner le vrai message d'erreur (`error.message`) plutot qu'un message generique -- c'est ce qui a permis de resoudre presque tous les bugs difficiles de cette session
- Le probleme de cache navigateur (PWA) revient regulierement -- toujours suggerer navigation privee ou desinstallation/reinstallation complete avant de chercher un bug plus profond si le comportement rapporte ne correspond pas au code actuel
