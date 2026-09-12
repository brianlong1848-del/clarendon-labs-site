// The Borea marketing page in both of the app's languages.
//
// Borea ships in English and Canadian French, so the site does too — a page
// that only speaks English while the product speaks Quebec French sends the
// wrong signal to exactly the market the French was built for.
//
// The French here is the same register as the app: vouvoiement throughout,
// déjeuner/dîner/souper for the meals, guillemets with their spacing. It is
// not machine French dressed up, and it should not be edited into France
// French — "souper" is deliberate.

export const APP_STORE_URL = 'https://apps.apple.com/app/id6799219647'

// Absolute rather than relative, because this page is served from two hosts:
// boreaapp.com (via rewrites in next.config.mjs) and clarendon.dev/borea. A
// relative /fr resolves correctly on the first and 404s on the second.
// Borea has its own domain, so it gets its own tab icon rather than inheriting
// the Clarendon "C" from the root layout. SVG first for sharpness, a 32px PNG
// and an .ico behind it for browsers that ignore SVG favicons.
export const BOREA_ICONS = {
  icon: [
    { url: '/borea-favicon.svg', type: 'image/svg+xml' },
    { url: '/borea-favicon-32.png', type: 'image/png', sizes: '32x32' },
    { url: '/borea-favicon.ico', sizes: '48x48' },
  ],
  apple: '/borea-apple-touch-icon.png',
}

export const EN_URL = 'https://boreaapp.com/'
export const FR_URL = 'https://boreaapp.com/fr'

export type Faq = { q: string; a: string }

export type Copy = {
  lang: string
  htmlLang: string
  shotDir: string
  otherLangLabel: string
  otherLangHref: string
  otherLangHreflang: string
  meta: { title: string; description: string; ogDescription: string }
  nav: { how: string; coach: string; pricing: string; faq: string }
  hero: { tagline: string; download: string; downloadNote: string }
  how: { eyebrow: string; h2: string; lede: string; steps: { h: string; p: string }[] }
  coach: {
    eyebrow: string; h2: string; lede: string; orbCaption: string; phases: string[]
    you: string; borea: string; question: string; answer: string
  }
  features: { eyebrow: string; h2: string; cards: { ic: string; h: string; p: string }[] }
  // Alt text for the real screenshots. Written as what the screen shows,
  // not "screenshot of…", so a screen reader gets the same content a sighted
  // visitor does.
  shots: { today: string; brief: string; trends: string; log: string; widgets: string }
  widgets: { eyebrow: string; h2: string; lede: string }
  privacy: { eyebrow: string; h2: string; lede: string; cta: string; href: string }
  pricing: {
    eyebrow: string; h2: string; lede: string
    monthly: string; monthlyAmt: string; per: string
    yearly: string; yearlyAmt: string; perYear: string; save: string
  }
  faqSection: { eyebrow: string; h2: string; items: Faq[] }
  cta: { note: string; download: string; contact: string; contactHref: string }
  foot: { copyright: string; privacy: string; terms: string; support: string }
}

export const en: Copy = {
  lang: 'en',
  htmlLang: 'en',
  shotDir: '/borea',
  otherLangLabel: 'FR',
  otherLangHref: FR_URL,
  otherLangHreflang: 'fr-CA',
  meta: {
    title: 'Borea — The AI macro coach that talks back',
    description:
      'Borea is an AI macro and calorie counter for iPhone. Log meals by voice, photo, or barcode, sync your DEXA scans, and get coaching that reads your actual log instead of handing you generic advice.',
    ogDescription:
      'Log meals by voice, photo, or barcode. Get coaching that knows your macros, your DEXA scans, and your goals.',
  },
  nav: { how: 'How it works', coach: 'The coach', pricing: 'Pricing', faq: 'FAQ' },
  hero: {
    tagline:
      'The AI macro coach that talks back. Log by voice, photo, or barcode &mdash; then ask why the scale moved and get an answer from your own numbers.',
    download: 'Download on the App Store',
    downloadNote: 'Free to download &middot; 7-day trial of Borea Pro &middot; iPhone',
  },
  how: {
    eyebrow: 'How it works',
    h2: 'Three taps, or none at all',
    lede: 'Most tracking apps die on the friction of logging. Borea is built so the boring part takes seconds and the useful part happens on its own.',
    steps: [
      { h: 'Log it however you like', p: 'Talk to it, scan a barcode, photograph the plate, or weigh a portion in grams. The serving maths is handled everywhere you log.' },
      { h: 'Borea does the reading', p: 'Weighed grams, sodium, water, protein against a floor that never moves. Your DEXA scans and Apple Health weigh-ins fold in automatically.' },
      { h: 'Ask it anything', p: '&ldquo;Why am I stalling?&rdquo; The coach answers out loud from your actual log, and will tell you when the plan you want isn&rsquo;t the plan physics allows.' },
    ],
  },
  coach: {
    eyebrow: 'The coach',
    h2: 'A coach, not a search box',
    lede: 'Borea reads what you actually ate and what your body actually did. It has opinions, it shows its working, and it would rather be honest than encouraging.',
    orbCaption: 'The coach, thinking',
    phases: ['Reading your week…', 'Weighing today&rsquo;s macros…', 'Consulting your DEXA trend…', 'Writing back…'],
    you: 'You',
    borea: 'Borea',
    question: 'Why is my weight up when I hit my calories all week?',
    answer:
      'Because you ate 4,800&nbsp;mg of sodium on Saturday and 1,100 on Sunday. That&rsquo;s water, not fat &mdash; your seven-day average is still down 0.9&nbsp;lb, and your last DEXA says the lean mass is holding. Nothing is wrong. Drink, and ignore the scale until Wednesday.',
  },
  features: {
    eyebrow: 'Features',
    h2: 'What&rsquo;s in it',
    cards: [
      { ic: 'mic', h: 'Say it, it&rsquo;s logged', p: '&ldquo;Two eggs, sourdough toast, and the same Greek yogurt bar I had yesterday.&rdquo; Borea works out the macros &mdash; grams weighed, sodium included.' },
      { ic: 'scan', h: 'Scan &amp; weigh', p: 'Barcodes, photos of plates, and weighed portions in grams or ounces. Serving math is handled for you, every place you log.' },
      { ic: 'dexa', h: 'DEXA-aware', p: 'Sync body-composition scans and watch fat and lean mass move separately, so the advice protects muscle instead of chasing the scale.' },
      { ic: 'plan', h: 'Plans with a spine', p: 'Pick a target and a date. If the maths doesn&rsquo;t work Borea says so, with humour, and offers the date that does &mdash; or the result that date can actually deliver.' },
      { ic: 'reel', h: 'Transformation reels', p: 'Progress photos are body-aligned with Vision, then played back as a morph you can export as a GIF to text or a 9:16 video for Reels and TikTok.' },
      { ic: 'sun', h: 'A brief every morning', p: 'Before you eat, the coach reads yesterday, your weigh-in and what today is for, and writes three lines: what to hit, what to skip, and why. Peak week, travel day, rest day &mdash; it changes.' },
    ],
  },
  shots: {
    today: 'Borea&rsquo;s Today screen: the aurora calorie ring reading 200 kcal left, protein, carbs and fat bars beneath it, and a Coach&rsquo;s brief.',
    brief: 'The Coach&rsquo;s brief on a peak-week day: taper water, keep food familiar, with dos and avoids listed.',
    trends: 'The Trends screen: body fat 18.2%, down 3.0 points since November, above lean-mass and fat-mass tiles.',
    log: 'The Log a meal screen with the aurora microphone, ready to hear what you ate.',
    widgets: 'An iPhone Home Screen with Borea&rsquo;s aurora widgets: the calorie ring, a protein battery, and a water bottle filling.',
  },
  widgets: {
    eyebrow: 'Widgets',
    h2: 'The sky, on your Home Screen',
    lede: 'A water bottle that fills as you drink, a protein battery that charges through the day, and the calorie ring &mdash; each one a glance, none of them a chore. They read the same numbers as the app, so what the widget says is what the coach knows.',
  },
  privacy: {
    eyebrow: 'Privacy',
    h2: 'Your health data stays yours',
    lede: 'Your log, your weigh-ins and your progress photos live on your iPhone. When you ask the coach a question, the numbers needed to answer it are sent to process that question &mdash; nothing more. Your health data is never used for advertising, never sold, and never used to train a model. Delete the app and it goes with it.',
    cta: 'Read the privacy policy &rarr;',
    href: '/privacy',
  },
  pricing: {
    eyebrow: 'Pricing',
    h2: 'One subscription, everything in it',
    lede: 'No credit packs, no locked features, no upsell for the coach. Seven days free, cancel in two taps.',
    monthly: 'Monthly', monthlyAmt: '$7.99', per: 'per month',
    yearly: 'Yearly', yearlyAmt: '$59.99', perYear: 'per year',
    save: 'Save 37% &middot; under $5 a month',
  },
  faqSection: {
    eyebrow: 'FAQ',
    h2: 'Questions',
    items: [
      { q: 'What makes Borea different from MyFitnessPal or Cronometer?', a: 'Those apps are databases with a diary attached — they tell you what you ate. Borea reads the same log and tells you what to do about it. Ask why your weight stalled and the coach answers from your actual numbers, out loud if you want, rather than serving a generic article.' },
      { q: 'Does Borea count macros as well as calories?', a: 'Yes. Protein, carbs, fat, water and sodium are tracked on every entry, with weighed portions in grams or ounces. Protein has a hard floor in every plan because holding lean mass is the point of the whole exercise.' },
      { q: 'Can I log a meal by talking?', a: 'Yes. Say "two eggs, sourdough toast, and the same yogurt bar as yesterday" and Borea works out the macros, including the serving maths. You can also scan a barcode, photograph the plate, or type it.' },
      { q: 'Does Borea work with DEXA scans?', a: 'Yes, and it is the reason the coaching is different. Sync your body-composition scans and Borea separates fat loss from lean-mass loss, so the advice protects muscle instead of chasing scale weight.' },
      { q: 'Where is my health data stored?', a: 'On your iPhone. Your log, weigh-ins and progress photos live on the device. When you ask the coach a question the relevant numbers are sent to process that question and are not used to train any model, and your health data is never used for advertising.' },
      { q: 'What does Borea cost?', a: 'Borea Pro is $7.99 a month or $59.99 a year, with a 7-day free trial. One subscription covers everything: the coach, the plans, the widgets and the transformation reels.' },
      { q: 'Is Borea available in French?', a: 'Yes. Borea ships in English and Canadian French, including the meal names Quebecers actually use — déjeuner, dîner et souper. This site is in French too.' },
      { q: 'Where do I get it?', a: 'On the App Store, for iPhone. Borea is free to download and comes with a 7-day free trial of Borea Pro.' },
    ],
  },
  cta: {
    note: 'Borea is on the App Store now. Free to download, with a 7-day trial of everything.',
    download: 'Download on the App Store',
    contact: 'Get in touch &rarr;',
    contactHref: 'mailto:hello@clarendon.dev?subject=Borea',
  },
  foot: { copyright: '&copy; 2026 <a href="https://clarendon.dev">Clarendon Labs LLC</a> &middot; Chicago', privacy: 'Privacy', terms: 'Terms', support: 'Support' },
}

export const fr: Copy = {
  lang: 'fr',
  htmlLang: 'fr-CA',
  shotDir: '/borea/fr',
  otherLangLabel: 'EN',
  otherLangHref: EN_URL,
  otherLangHreflang: 'en',
  meta: {
    title: 'Borea — Le coach de macros IA qui vous répond',
    description:
      'Borea est un compteur de macros et de calories propulsé par l’IA, pour iPhone. Enregistrez vos repas à la voix, par photo ou par code-barres, synchronisez vos scans DEXA, et recevez un coaching qui lit votre vrai journal au lieu de vous servir des conseils génériques.',
    ogDescription:
      'Enregistrez vos repas à la voix, par photo ou par code-barres. Un coaching qui connaît vos macros, vos scans DEXA et vos objectifs.',
  },
  nav: { how: 'Comment ça marche', coach: 'Le coach', pricing: 'Tarifs', faq: 'FAQ' },
  hero: {
    tagline:
      'Le coach de macros IA qui vous répond. Enregistrez à la voix, par photo ou par code-barres &mdash; puis demandez pourquoi la balance a bougé et obtenez une réponse tirée de vos propres chiffres.',
    download: 'Télécharger sur l&rsquo;App Store',
    downloadNote: 'Téléchargement gratuit &middot; essai de 7 jours de Borea Pro &middot; iPhone',
  },
  how: {
    eyebrow: 'Comment ça marche',
    h2: 'Trois touches, ou aucune',
    lede: 'La plupart des applis de suivi meurent de la friction de l&rsquo;enregistrement. Borea est bâtie pour que la partie plate prenne quelques secondes et que la partie utile se fasse toute seule.',
    steps: [
      { h: 'Enregistrez comme vous voulez', p: 'Parlez-lui, scannez un code-barres, photographiez l&rsquo;assiette, ou pesez une portion en grammes. Le calcul des portions est géré partout où vous enregistrez.' },
      { h: 'Borea fait la lecture', p: 'Grammes pesés, sodium, eau, protéines contre un plancher qui ne bouge jamais. Vos scans DEXA et vos pesées Apple Santé s&rsquo;intègrent automatiquement.' },
      { h: 'Posez-lui n&rsquo;importe quelle question', p: '&laquo;&nbsp;Pourquoi est-ce que je stagne&nbsp;?&nbsp;&raquo; Le coach répond à voix haute à partir de votre vrai journal, et vous dira quand le plan que vous voulez n&rsquo;est pas celui que la physique permet.' },
    ],
  },
  coach: {
    eyebrow: 'Le coach',
    h2: 'Un coach, pas une boîte de recherche',
    lede: 'Borea lit ce que vous avez réellement mangé et ce que votre corps a réellement fait. Elle a des opinions, elle montre son raisonnement, et elle préfère être honnête qu&rsquo;encourageante.',
    orbCaption: 'Le coach réfléchit',
    phases: ['Lecture de votre semaine…', 'Évaluation des macros du jour…', 'Consultation de votre tendance DEXA…', 'Rédaction de la réponse…'],
    you: 'Vous',
    borea: 'Borea',
    question: 'Pourquoi mon poids monte alors que j&rsquo;ai respecté mes calories toute la semaine&nbsp;?',
    answer:
      'Parce que vous avez mangé 4&nbsp;800&nbsp;mg de sodium samedi et 1&nbsp;100 dimanche. C&rsquo;est de l&rsquo;eau, pas du gras &mdash; votre moyenne sur sept jours est encore en baisse de 0,9&nbsp;lb, et votre dernier DEXA dit que la masse maigre tient. Rien ne cloche. Buvez, et ignorez la balance jusqu&rsquo;à mercredi.',
  },
  features: {
    eyebrow: 'Fonctions',
    h2: 'Ce qu&rsquo;il y a dedans',
    cards: [
      { ic: 'mic', h: 'Dites-le, c&rsquo;est enregistré', p: '&laquo;&nbsp;Deux œufs, une rôtie au levain, et la même barre de yogourt grec qu&rsquo;hier.&nbsp;&raquo; Borea calcule les macros &mdash; grammes pesés, sodium inclus.' },
      { ic: 'scan', h: 'Scannez et pesez', p: 'Codes-barres, photos d&rsquo;assiettes, et portions pesées en grammes ou en onces. Le calcul des portions est fait pour vous, partout où vous enregistrez.' },
      { ic: 'dexa', h: 'Pensée pour le DEXA', p: 'Synchronisez vos scans de composition corporelle et voyez le gras et la masse maigre bouger séparément, pour que les conseils protègent le muscle au lieu de courir après la balance.' },
      { ic: 'plan', h: 'Des plans avec une colonne', p: 'Choisissez une cible et une date. Si le calcul ne tient pas, Borea le dit, avec humour, et propose la date qui fonctionne &mdash; ou le résultat que cette date peut réellement donner.' },
      { ic: 'reel', h: 'Séquences de transformation', p: 'Les photos de progression sont alignées sur le corps avec Vision, puis rejouées en fondu que vous pouvez exporter en GIF à envoyer par message, ou en vidéo 9:16 pour les Reels et TikTok.' },
      { ic: 'sun', h: 'Un brief chaque matin', p: 'Avant de manger, le coach relit la veille, votre pesée et ce que la journée demande, puis écrit trois lignes&nbsp;: quoi viser, quoi éviter, et pourquoi. Semaine de pointe, jour de voyage, jour de repos &mdash; ça change.' },
    ],
  },
  shots: {
    today: 'L&rsquo;écran Aujourd&rsquo;hui de Borea&nbsp;: l&rsquo;anneau de calories aurore indiquant 200 kcal restantes, les barres de protéines, glucides et lipides en dessous, et le brief du coach.',
    brief: 'Le brief du coach un jour de semaine de pointe&nbsp;: réduire l&rsquo;eau, garder des aliments familiers, avec les choses à faire et à éviter.',
    trends: 'L&rsquo;écran Tendances&nbsp;: 18,2&nbsp;% de gras corporel, en baisse de 3,0 points depuis novembre, au-dessus des tuiles de masse maigre et de masse grasse.',
    log: 'L&rsquo;écran Enregistrer un repas avec le micro aurore, prêt à entendre ce que vous avez mangé.',
    widgets: 'Un écran d&rsquo;accueil d&rsquo;iPhone avec les widgets aurore de Borea&nbsp;: l&rsquo;anneau de calories, une pile de protéines et une bouteille d&rsquo;eau qui se remplit.',
  },
  widgets: {
    eyebrow: 'Widgets',
    h2: 'Le ciel, sur votre écran d&rsquo;accueil',
    lede: 'Une bouteille d&rsquo;eau qui se remplit à mesure que vous buvez, une pile de protéines qui se charge au fil de la journée, et l&rsquo;anneau de calories &mdash; chacun un coup d&rsquo;œil, aucun une corvée. Ils lisent les mêmes chiffres que l&rsquo;appli, alors ce que dit le widget, le coach le sait.',
  },
  privacy: {
    eyebrow: 'Confidentialité',
    h2: 'Vos données de santé restent les vôtres',
    lede: 'Votre journal, vos pesées et vos photos de progression vivent sur votre iPhone. Quand vous posez une question au coach, seuls les chiffres nécessaires pour y répondre sont envoyés pour traiter cette question &mdash; rien de plus. Vos données de santé ne servent jamais à la publicité, ne sont jamais vendues, et ne servent jamais à entraîner un modèle. Supprimez l&rsquo;appli et elles partent avec.',
    cta: 'Lire la politique de confidentialité &rarr;',
    href: '/privacy',
  },
  pricing: {
    eyebrow: 'Tarifs',
    h2: 'Un abonnement, tout est dedans',
    lede: 'Pas de blocs de crédits, pas de fonctions verrouillées, pas de supplément pour le coach. Sept jours gratuits, annulation en deux touches.',
    monthly: 'Mensuel', monthlyAmt: '7,99&nbsp;$', per: 'par mois',
    yearly: 'Annuel', yearlyAmt: '59,99&nbsp;$', perYear: 'par année',
    save: 'Économisez 37&nbsp;% &middot; moins de 5&nbsp;$ par mois',
  },
  faqSection: {
    eyebrow: 'FAQ',
    h2: 'Questions',
    items: [
      { q: 'Qu’est-ce qui distingue Borea de MyFitnessPal ou Cronometer ?', a: 'Ces applis sont des bases de données avec un journal collé dessus — elles vous disent ce que vous avez mangé. Borea lit le même journal et vous dit quoi en faire. Demandez pourquoi votre poids stagne et le coach répond à partir de vos vrais chiffres, à voix haute si vous voulez, plutôt que de vous servir un article générique.' },
      { q: 'Est-ce que Borea compte les macros en plus des calories ?', a: 'Oui. Protéines, glucides, lipides, eau et sodium sont suivis sur chaque entrée, avec des portions pesées en grammes ou en onces. Les protéines ont un plancher ferme dans chaque plan, parce que conserver la masse maigre est tout le but de l’exercice.' },
      { q: 'Est-ce que je peux enregistrer un repas en parlant ?', a: 'Oui. Dites « deux œufs, une rôtie au levain, et la même barre de yogourt qu’hier » et Borea calcule les macros, y compris les portions. Vous pouvez aussi scanner un code-barres, photographier l’assiette, ou l’écrire.' },
      { q: 'Est-ce que Borea fonctionne avec les scans DEXA ?', a: 'Oui, et c’est la raison pour laquelle le coaching est différent. Synchronisez vos scans de composition corporelle et Borea sépare la perte de gras de la perte de masse maigre, pour que les conseils protègent le muscle au lieu de courir après le poids sur la balance.' },
      { q: 'Où sont stockées mes données de santé ?', a: 'Sur votre iPhone. Votre journal, vos pesées et vos photos de progression restent sur l’appareil. Quand vous posez une question au coach, les chiffres pertinents sont envoyés pour traiter cette question et ne servent à entraîner aucun modèle, et vos données de santé ne servent jamais à la publicité.' },
      { q: 'Combien coûte Borea ?', a: 'Borea Pro est à 7,99 $ par mois ou 59,99 $ par année, avec un essai gratuit de 7 jours. Un seul abonnement couvre tout : le coach, les plans, les widgets et les séquences de transformation.' },
      { q: 'Est-ce que Borea est offerte en français ?', a: 'Oui. Borea est offerte en anglais et en français canadien, y compris les noms de repas que les Québécois utilisent vraiment — déjeuner, dîner et souper. Ce site est aussi en français.' },
      { q: 'Où est-ce que je la télécharge ?', a: 'Sur l’App Store, pour iPhone. Borea est gratuite à télécharger et vient avec un essai gratuit de 7 jours de Borea Pro.' },
    ],
  },
  cta: {
    note: 'Borea est maintenant sur l&rsquo;App Store. Téléchargement gratuit, avec un essai de 7 jours de tout.',
    download: 'Télécharger sur l&rsquo;App Store',
    contact: 'Nous écrire &rarr;',
    contactHref: 'mailto:hello@clarendon.dev?subject=Borea',
  },
  foot: { copyright: '&copy; 2026 <a href="https://clarendon.dev">Clarendon Labs LLC</a> &middot; Chicago', privacy: 'Confidentialité', terms: 'Conditions', support: 'Soutien' },
}
