# Publier THT sur le Google Play Store — notice pas à pas

Ce document explique comment transformer THT (qui est un site web installable, une « PWA »)
en application Android publiable sur le Play Store, **sans modifier une seule ligne du code
de l'application**.

Tout ce qui pouvait être préparé à l'avance l'est déjà (voir « Ce qui est déjà fait »).
Les étapes restantes demandent **ton compte Google** et **ta clé de signature**, qui doivent
rester entre tes mains — personne d'autre ne doit les détenir, pas même un assistant.

---

## Comprendre en une minute

Le Play Store n'accepte pas un site web : il veut un fichier Android (`.aab`).

On fabrique donc une **coquille Android** : une petite application qui affiche ton site en
plein écran, sans barre de navigateur. L'utilisatrice ne voit aucune différence, elle croit
utiliser une application classique. Cette technique s'appelle **TWA** (Trusted Web Activity)
et l'outil officiel de Google pour la mettre en place s'appelle **Bubblewrap**.

**Le gros avantage :** l'application va chercher ton site en ligne. Donc quand tu pousses une
mise à jour sur GitHub → Cloudflare déploie → **l'application est mise à jour immédiatement**,
sans repasser par le Play Store et sans attendre une validation de Google.

---

## Ce qui est déjà fait

- [x] `public/manifest.json` conforme (nom, langue, catégories, icônes séparées `any` / `maskable`)
- [x] `public/icon-maskable-512.png` créée avec la marge de sécurité qu'Android exige
      (sans ça, l'icône aurait été rognée sur l'écran d'accueil)
- [x] `public/confidentialite.html` — politique de confidentialité, **obligatoire** pour publier
- [x] Lien vers cette politique depuis l'application (Profil → « Politique de confidentialité »)
- [x] `twa-manifest.json` — la configuration Bubblewrap, déjà remplie avec ton domaine
- [x] Le service worker gère les notifications push et le cache

## Ce qu'il reste à faire (par toi)

---

### Étape 1 — Ouvrir le compte développeur Google Play

1. Va sur <https://play.google.com/console>
2. Crée un compte développeur : **25 $ une seule fois** (≈ 15 000 FCFA), jamais renouvelé
3. Choisis un compte **personnel** (le compte « organisation » exige des documents d'entreprise)

⚠️ **Important à savoir :** pour les nouveaux comptes personnels, Google impose un
**test fermé avec au moins 12 testeurs pendant 14 jours** avant d'autoriser la publication
publique. Ce n'est pas un obstacle, c'est une chance : ces 12 personnes sont tes 12 premières
vraies utilisatrices, et ce test t'évitera de mauvaises notes le jour du lancement.

---

### Étape 2 — Installer Bubblewrap (sur un ordinateur)

Il faut un ordinateur avec Node.js installé. Depuis un terminal :

```bash
npm install -g @bubblewrap/cli
```

Au premier lancement, Bubblewrap propose de télécharger automatiquement le JDK et le SDK
Android dont il a besoin : accepte.

---

### Étape 3 — Générer le projet Android

Place-toi dans un dossier de travail (pas dans le dépôt THT, pour ne pas mélanger) :

```bash
bubblewrap init --manifest https://tontine.kbsdigitalagency.com/manifest.json
```

Bubblewrap pose une série de questions. Réponds ainsi :

| Question | Réponse |
|---|---|
| Domain | `tontine.kbsdigitalagency.com` |
| Application name | `THT - Tontine Habi Traore` |
| Short name | `THT` |
| Application ID / package | `com.kbsdigitalagency.tht` |
| Start URL | `/` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#FF6B00` |
| Include support for Push Notifications ? | **oui** (sinon les rappels ne fonctionneront pas) |
| Signing key | en créer une nouvelle |

💡 Tu peux aussi copier le fichier `twa-manifest.json` de ce dépôt dans ton dossier de travail :
il contient déjà toutes ces réponses. Lance ensuite simplement `bubblewrap build`.

---

### Étape 4 — 🔑 La clé de signature (À NE JAMAIS PERDRE)

Bubblewrap crée un fichier `.keystore` protégé par deux mots de passe.

> **C'est le point le plus important de toute cette notice.**
> Cette clé prouve à Google que les mises à jour viennent bien de toi.
> **Si tu la perds, tu ne pourras plus jamais mettre ton application à jour** — il faudrait
> republier sous un autre nom et tous tes utilisateurs seraient perdus.

À faire immédiatement après sa création :
- Sauvegarde le fichier `.keystore` **à deux endroits différents** (par exemple Google Drive
  privé + une clé USB gardée chez toi)
- Note les deux mots de passe **ailleurs que sur ton téléphone**
- Ne l'envoie **à personne**, jamais, sous aucun prétexte

💡 Active aussi **Play App Signing** dans la Play Console (c'est proposé par défaut) : Google
garde alors une copie de sécurité de la clé de publication, ce qui te protège en cas de perte.

---

### Étape 5 — Fabriquer le fichier à envoyer

```bash
bubblewrap build
```

Tu obtiens `app-release-bundle.aab` : c'est le fichier à téléverser sur le Play Store.

---

### Étape 6 — ⚠️ Relier l'application à ton domaine (étape la plus souvent oubliée)

Sans cette étape, ton application s'ouvrira **avec la barre d'adresse du navigateur visible**
— ce qui fait tout de suite « site web » au lieu d'« application », et abîme la crédibilité
que tu recherches justement.

1. Dans la **Play Console** : *Configuration → Intégrité de l'application → Signature d'application*
2. Copie l'empreinte **SHA-256 du certificat de signature**
3. Crée le fichier `public/.well-known/assetlinks.json` dans ce dépôt :

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.kbsdigitalagency.tht",
    "sha256_cert_fingerprints": ["COLLE_ICI_TON_EMPREINTE_SHA256"]
  }
}]
```

4. Pousse sur GitHub → Cloudflare déploie
5. Vérifie que <https://tontine.kbsdigitalagency.com/.well-known/assetlinks.json> s'affiche bien

---

### Étape 7 — Remplir la fiche Play Store

| Élément | Quoi mettre |
|---|---|
| Politique de confidentialité | `https://tontine.kbsdigitalagency.com/confidentialite.html` |
| Catégorie | Finance |
| Classification du contenu | Remplir le questionnaire (aucun contenu sensible) |
| Sécurité des données | Déclarer : numéro de téléphone, nom, photos, messages. Cocher « chiffré en transit » et « suppression possible sur demande » |
| Captures d'écran | Minimum 2 en format téléphone (accueil, une tontine, la messagerie) |
| Icône | 512 × 512 (`icon-512.png`) |
| Image de présentation | 1024 × 500 (à créer — l'image de couverture peut servir de base) |
| Description courte | « Gère tes tontines, cagnottes et épargne en toute confiance. » |

⚠️ **Section « Services financiers » :** THT touche à la gestion d'argent, Google posera donc
des questions supplémentaires. **Réponds la vérité, qui joue en ta faveur :** THT n'est ni une
banque ni un service de paiement, elle ne détient ni ne transfère aucun fonds ; c'est un
**carnet de comptes numérique**. L'argent circule directement entre les membres, en main propre
ou via leur opérateur mobile.

---

### Étape 8 — Le paiement de l'abonnement Premium

**À lire avant de publier.** Google impose généralement son propre système de paiement pour
les abonnements vendus **à l'intérieur** d'une application, avec une commission d'environ 15 %.

Deux raisons de ne pas passer par là :
1. Le paiement Google exige une carte bancaire, que la majorité de tes utilisatrices au Mali
   n'ont pas. Elles paient par Orange Money ou Wave.
2. La commission est environ 6 fois plus élevée que celle d'un prestataire local.

**Ce qu'il faut faire :** vendre l'abonnement **sur le site web**, pas dans l'application.
Dans l'application, se contenter d'indiquer que la fonction est réservée au Premium, sans
bouton de paiement. La personne paie sur le site avec son numéro, son compte passe en Premium
en base, et l'application le reconnaît automatiquement à la prochaine ouverture.

⚠️ Google restreint le fait de **placer un lien vers un paiement externe dans l'application**.
Les règles ont beaucoup évolué récemment et varient selon les pays : **vérifie la règle en
vigueur au moment de publier**. Le plus prudent est de communiquer le lien par WhatsApp ou de
bouche à oreille plutôt que dans l'application.

---

## Mettre à jour l'application par la suite

**Changement dans le code de l'app** (texte, écran, correction de bug) :
→ tu pousses sur GitHub, Cloudflare déploie, **c'est automatiquement dans l'application**.
Rien à refaire côté Play Store. 🎉

**Changement du nom, de l'icône ou des permissions :**
→ modifier `twa-manifest.json`, augmenter `appVersionCode` de 1, relancer `bubblewrap build`,
puis renvoyer le nouveau `.aab` sur la Play Console.

---

## Rappel avant de publier

Ne publie **pas** avant d'avoir fait tester l'application par 10 à 12 vraies personnes.
Les premières notes du Play Store restent attachées à ta fiche pour toujours : une mauvaise
note de départ est presque impossible à rattraper, même après correction des bugs.

Bonne chance ! 🚀
