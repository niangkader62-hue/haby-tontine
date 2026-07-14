# THT (Tontine Habi Traore) — Etat complet du projet

## Contexte
App PWA de gestion de tontines, cagnottes solidaires et epargne pour l'Afrique de l'Ouest francophone (Mali principalement). Nommee en hommage a Habi Traore, la mere de Kader (proprietaire/createur, non-developpeur). Stack : React + Vite (frontend), Supabase (base de donnees + fonctions serveur + stockage), Netlify (hebergement, deploiement automatique sur push vers `main`).

Kader ne code pas lui-meme. Un assistant Claude ecrit tout le code, commit et pousse directement sur GitHub avec un token temporaire fourni par Kader a chaque session (le token doit etre revoque par Kader une fois le push termine). Kader teste principalement sur telephone Android (Chrome), communique via captures d'ecran ou voix. Il a aussi un ordinateur avec Claude Code installe, utilisable en parallele sur le meme depot -- toujours demander en debut de session s'il est sur telephone ou ordinateur.

Depot : `niangkader62-hue/haby-tontine`. Site : `https://haby-tontine.netlify.app`.

## Fonctionnalites (toutes construites et deployees)

**Tontines**
- Creation, gestion des membres, cotisations a montant standard ou personnalise par membre
- Ajout de membres : un par un (formulaire), **ou plusieurs a la fois** en selectionnant plusieurs contacts Android (`navigator.contacts.select` avec `multiple:true`) -- les valides sont inseres en boucle, les doublons/numeros invalides/limite gratuite sont comptes et signales dans un toast recapitulatif
- **Modifier un membre existant** (bouton "✏️ Modifier" sur chaque fiche membre) : prenom, numero, quartier, montant personnalise -- cette fonctionnalite n'existait pas avant, on ne pouvait qu'ajouter/supprimer
- Marquage paye/non paye, historique des versements avec photo de preuve
- **Archive des recus** : dans l'historique d'un membre, bouton "🧾 Voir / repartager le recu" sur chaque paiement passe -- regenere l'image du recu a la demande (a partir des donnees de la transaction stockee, dont le cycle) et rouvre le partage/telechargement, meme longtemps apres le versement initial
- Tirage au sort du gagnant de chaque cycle (contrainte anti-doublon en base)
- Bouton "Cloturer le cycle"
- Bureau (presidente/tresoriere/secretaire), elections
- Prets : demande par le membre, acceptation/refus par la creatrice (taux d'interet + date d'echeance + photo de preuve), suivi du remboursement
- Checklist de suivi (onglet "Suivi") : montant recu / recu envoye / dette / photo, par versement. Role "collecteur" delegable a 1-2 membres
- Caisse sociale : fonds separe des cotisations, historique visible par la creatrice ET les membres
- Messagerie de groupe + privee, notifications push en temps reel
- Rapports de reunion, taches, evenements (mariage/naissance/deces)
- Export PDF (rapport) et CSV/Excel
- Transparence : le membre voit tout ce que voit la creatrice, sans pouvoir modifier

**Cagnottes solidaires**
- **Depuis cette session : onglet dedie "Cagnottes" dans la barre de navigation** (5 sections : Accueil, Cagnottes, Epargne, HABY, Profil) -- avant, la liste des cagnottes etait melangee avec les tontines sur l'ecran Accueil, ce qui creait de la confusion
- Creation (mariage, sante, funerailles, etudes...), lien de contribution PUBLIC (sans compte requis), photo de preuve obligatoire
- Incrementation atomique du montant collecte
- Notification automatique a la creatrice a chaque contribution
- Bouton "Notifier un groupe" : push + lien WhatsApp pre-rempli

**Epargne personnelle** ("Ma Tirelire") : objectifs d'epargne individuels

**Compte et securite**
- Inscription/connexion par numero de telephone + PIN 4 chiffres
- **Selecteur de pays : 225 pays** (liste quasi mondiale complete, generee via les packages `country-telephone-data` + `i18n-iso-countries` pour les noms français et drapeaux -- avant, seulement 40 pays)
- Changement de PIN (Profil + Panneau Admin)
- Tutoriel de bienvenue a l'inscription (4 ecrans)
- Notifications push (VAPID), rappels automatiques quotidiens
- Bouton retour Android (historique navigateur)

**Panneau Administrateur**
- Tableau de bord (utilisateurs, tontines, paiements)
- Remise a zero complete des donnees de test, protegee par 2 codes de securite + mot "SUPPRIMER", verifies cote serveur
- **BUG RESOLU CETTE SESSION** : la remise a zero "refusait" a cause d'une contrainte de cle etrangere incomplete -- `votes.candidate_membre_id` referencait `membres(id)` SANS `on delete cascade` (seul oubli parmi toutes les tables du schema). Resultat : impossible de supprimer un membre qui avait deja ete candidat a une election, que ce soit via la remise a zero OU via le bouton normal "retirer un membre". Corrige par migration SQL (`supabase_fix_votes_cascade.sql`, executee par Kader directement dans Supabase SQL Editor -- pas besoin de redeployer le code pour ce genre de correctif, uniquement pour les changements de `src/`).

**HABY (assistante IA dans l'app)**
- Basee sur Gemini (edge function `haby-chat`), connaissance complete des fonctionnalites de l'app dans son prompt systeme

**Design**
- Palette orange/noir, police Inter
- Bandeau carrousel promotionnel sur l'accueil (le clic sur "Cagnottes solidaires" ouvre maintenant l'onglet Cagnottes dedie plutot que directement la modale de creation)
- **Nouveau logo assorti au theme orange/noir** (cette session) : remplace l'ancien logo dore/vert (silhouette + H/T) par un embleme genere (gradient orange->noir 135deg identique au gradient des boutons CTA, anneau de points evoquant le cercle de cotisants d'une tontine, monogramme "HT"). Remplace dans les 4 emplacements : `src/assets/logo-icon.png` (256px, utilise dans l'app), `public/icon-192.png`, `public/icon-512.png` (icones PWA, zone de securite "maskable" respectee), `public/apple-touch-icon.png` (180px). La lueur residuelle doree de l'ecran de chargement (`rgba(212,168,67,...)`, ancienne couleur) a aussi ete remplacee par l'orange actuel (`rgba(255,107,0,...)`).
- **Passe d'accents francais** (cette session) : dictionnaire de traduction FR entierement corrige (Épargne, Créer, Déconnexion, Prêts, Réunions, Événements, Tâches, À jour, Écris à HABY, Exporter mes données, Mes épargnes) + ~70 chaines d'affichage supplementaires corrigees dans tout le fichier (recus, prets, elections, rapports, messages de confirmation/erreur, etc.), verifiees une par une pour ne jamais toucher les noms de colonnes/tables Supabase (ex: `telephone`, `frequence`, `date_echeance` restent volontairement sans accent car ce sont des identifiants techniques). **Portee honnete** : c'est une passe large et verifiee sur les textes les plus visibles, pas une garantie a 100% qu'il ne reste plus aucun mot sans accent nulle part -- si Kader repere encore des oublis, les signaler au fil de l'eau.

**Fiabilite**
- Error Boundary React, audit ESLint (`no-undef`/`no-redeclare`) systematique avant chaque push
- Performance : jsPDF et html2canvas charges a la demande

## Fonctions serveur (Supabase Edge Functions)
- `send-push`, `daily-reminders`, `haby-chat` (Gemini)
- `cinetpay-init` / `cinetpay-webhook` : paiement en ligne -- **PAS ENCORE CONFIGURE**, cle CinetPay manquante. C'est la prochaine grosse etape.
- `cagnotte-contribute` : point d'entree public pour les contributions
- `admin-reset-data` : remise a zero -- fonctionnelle depuis la correction de la contrainte `votes` (voir plus haut)

## Scripts SQL -- statut
Le fichier `SCHEMA_COMPLET.sql` fait foi pour la structure de reference. `supabase_fix_votes_cascade.sql` (cette session) corrige la contrainte de cle etrangere sur `votes.candidate_membre_id`. De nombreux autres scripts `supabase_*.sql` existent dans l'historique du depot (fixes ponctuels) ; en cas de doute sur l'etat reel de la base, ne pas supposer qu'un script a ete execute -- demander confirmation a Kader ou verifier directement le schema.

## Discipline de deploiement
Netlify facture au credit (15 credits/deploiement). Regle : grouper plusieurs changements de code en un seul commit/push. Les correctifs SQL (comme celui des votes) s'executent directement dans Supabase SQL Editor et ne necessitent PAS de deploiement Netlify.

Workflow token GitHub : Kader cree un Personal Access Token (classic, scope "repo" uniquement, expiration courte) a chaque session ou un push est necessaire, le colle dans le chat, puis le revoque une fois le push confirme.

## Ce qui reste a faire (par priorite)
1. **CinetPay** : creation du compte marchand par Kader (cinetpay.com), puis integration reelle des paiements en ligne -- prochaine etape demandee par Kader
2. Suivi de la caisse sociale par membre individuel (actuellement solde global gere par la creatrice uniquement)
3. Renommage du sous-domaine Netlify
4. Test reel avec un vrai contact externe -- **0 utilisateur reel a ce jour**, fortement recommande avant tout lancement serieux ou avant CinetPay
5. Reliquat mineur d'accents francais si Kader en repere encore au fil de l'usage

## Notes pour la prochaine conversation
- Toujours lire les fichiers `SKILL.md` pertinents avant toute tache de creation de fichier
- Toujours faire `npm run build` ET `npx eslint src/App.jsx --no-eslintrc -c .eslintrc.cjs 2>&1 | grep -E "no-undef|no-redeclare"` avant de pousser
- Demander en debut de session si Kader est sur telephone (token GitHub a demander) ou sur ordinateur (Claude Code peut pousser directement)
- Kader communique en francais, teste sur Android via Chrome, souvent via captures d'ecran -- demander une description texte si une capture n'est pas claire
- Toujours donner le vrai message d'erreur (`error.message`) plutot qu'un message generique
- Le probleme de cache navigateur (PWA) revient regulierement -- suggerer navigation privee ou reinstallation complete avant de chercher un bug plus profond
- Les bugs de suppression/contraintes de cle etrangere (comme celui des votes) sont souvent mieux corriges au niveau du schema SQL (root cause, valable partout) plutot qu'en patchant uniquement la fonction qui le revele
