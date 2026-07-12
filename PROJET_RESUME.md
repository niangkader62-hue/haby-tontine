# THT (Tontine Habi Traore) — Etat du projet

## Contexte
App PWA de gestion de tontines, cagnottes solidaires et epargne pour l'Afrique de l'Ouest francophone (Mali principalement). Nommee en hommage a Habi Traore, la mere de Kader (createur/proprietaire, non-developpeur). Stack : React + Vite (frontend), Supabase (base de donnees + fonctions serveur + stockage), Netlify (hebergement, deploiement automatique sur push vers `main`).

Kader ne code pas lui-meme. Jusqu'ici, un assistant Claude (dans l'app mobile Claude) a ecrit tout le code, commit et pousse directement sur GitHub avec un token temporaire fourni a chaque session. Kader teste sur Android, communique via captures d'ecran et vocaux.

## Fonctionnalites principales (toutes deja construites et deployees)

**Tontines**
- Creation, gestion des membres, cotisations (montant standard ou personnalise par membre)
- Marquage paye/non paye, historique des versements avec photo de preuve
- Tirage au sort du gagnant de chaque cycle
- Bureau (president/tresoriere/secretaire), elections
- Prets : circuit demande (par le membre, dans sa propre tontine uniquement) -> acceptation/refus par la creatrice -> versement avec photo de preuve
- Checklist de suivi par versement (montant recu, recu envoye, dette, photo) + role "collecteur" delegable
- Caisse sociale (fonds separe des cotisations) avec registre de depenses (motif, date, historique)
- Messagerie de groupe + messages prives, avec notifications push
- Rapports de reunion, taches, evenements
- Export PDF et CSV/Excel des donnees

**Cagnottes solidaires**
- Creation par un utilisateur (mariage, sante, funerailles, etudes...)
- Lien de contribution PUBLIC (accessible sans compte THT), avec formulaire prenom/nom/telephone/montant
- Photo de preuve du depot obligatoire pour confirmer la contribution
- Notification automatique du createur a chaque nouvelle contribution
- Bouton pour notifier tous les membres d'une tontine (push pour ceux avec compte lie, lien WhatsApp pre-rempli pour les autres)

**Epargne personnelle** ("Ma Tirelire") : objectifs d'epargne individuels

**Compte et securite**
- Inscription/connexion par numero de telephone + PIN a 4 chiffres (via Supabase Auth, PIN transforme en mot de passe)
- Selecteur de pays avec indicatif (Mali +223 par defaut, + 7 autres pays ouest-africains) et recherche
- Changement de PIN (accessible depuis Profil et Panneau Admin)
- Notifications push (VAPID), rappels automatiques quotidiens (cron Supabase : J-1, jour J, retard)
- Panneau Administrateur : tableau de bord (utilisateurs, tontines, paiements), remise a zero complete des donnees de test (protegee par 2 codes de securite personnalises + confirmation par texte)

**Design**
- Palette de couleurs orange/noir (recemment changee depuis un theme vert/or, sur decision explicite de Kader malgre le risque de ressemblance avec Orange Money, qu'on lui a signale)
- Police Inter
- Bandeau carrousel promotionnel sur l'accueil (auto-defilant, avec points indicateurs)
- Tutoriel de bienvenue a l'inscription (4 ecrans)

## Fiabilite / robustesse
- Filet de securite (Error Boundary React) : si l'app plante, affiche le vrai message d'erreur + bouton "Retour a l'accueil", au lieu d'un ecran fige
- Audit ESLint mis en place (regle no-undef) pour detecter les variables non definies -- cause du bug le plus grave rencontre (plantage complet de l'onglet Message)
- Performance : le fichier JS principal a ete divise par 2 (chargement a la demande de jsPDF et html2canvas, utilises seulement pour les recus/PDF)

## Fonctions serveur (Supabase Edge Functions)
- `send-push` : envoi de notifications push
- `daily-reminders` : rappels quotidiens automatiques (cron 8h Bamako)
- `cinetpay-init` / `cinetpay-webhook` : paiement en ligne (PAS ENCORE CONFIGURE, cle CinetPay manquante)
- `cagnotte-contribute` : point d'entree public (sans authentification) pour les contributions de cagnotte
- `admin-reset-data` : remise a zero complete, protegee (vérifie que l'appelant est admin), utilise la cle service_role

## Ce qui N'EST PAS encore fait
- Configuration reelle de CinetPay (compte marchand a creer par Kader sur cinetpay.com, cles a ajouter dans les secrets Supabase) -- PROCHAINE ETAPE PRIORITAIRE
- Suivi de la caisse sociale par membre individuel (actuellement un solde global gere par la creatrice)
- Archive des recus envoyes (stockage/historique consultable)
- Renommage du sous-domaine Netlify
- Passe complete d'accents francais dans tout le code (actuellement texte simplifie sans accents par endroits)
- Aucun vrai utilisateur externe n'a encore teste l'app -- 0 utilisateur reel a ce jour

## Discipline de deploiement
Netlify facture desormais au credit (15 credits par deploiement, quel que soit le nombre de changements). Une session precedente a epuise 1000 credits en une journee a cause de deploiements trop frequents (un push par petite modification). Regle etablie : grouper plusieurs changements avant de pousser, attendre l'accord explicite de Kader avant chaque deploiement, sauf urgence de diagnostic necessitant un test en direct.

## Ou trouver le detail technique
Tous les scripts SQL sont dans le depot (fichiers `supabase_*.sql`), avec un fichier de reference consolide `SCHEMA_COMPLET.sql`. Le code frontend est entierement dans `src/App.jsx` (fichier unique, volumineux). Les fonctions serveur sont dans `supabase/functions/`.
