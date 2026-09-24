/**
 * Photos hébergées localement (site/img/players/<id>.jpg, 220x220 recadrées carré, ~9 Ko chacune)
 * pour la vitesse — servies par le CDN de GitHub Pages au lieu du thumbnail Google Drive (lent,
 * plusieurs centaines de ms par photo). Pour remplacer une photo : déposer le nouveau fichier au même
 * chemin (même format 220x220 carré recommandé) puis relancer le déploiement du site.
 */
var PHOTO_DATA = {
  ounas: "img/players/ounas.jpg",
  amjd: "img/players/amjd.jpg",
  chalpan: "img/players/chalpan.jpg",
  jamal: "img/players/jamal.jpg",
  bennacer: "img/players/bennacer.jpg",
  dame: "img/players/dame.jpg",
  fayez: "img/players/fayez.jpg",
  ahmad: "img/players/ahmad.jpg",
  aladin: "img/players/aladin.jpg",
  fabricio: "img/players/fabricio.jpg",
  ayoub: "img/players/ayoub.jpg",
  frank: "img/players/frank.jpg",
  jamil: "img/players/jamil.jpg",
  amro: "img/players/amro.jpg",
  jang: "img/players/jang.jpg",
  coman: "img/players/coman.jpg",
  "rayyan-ali": "img/players/rayyan-ali.jpg",
  khalifa: "img/players/khalifa.jpg",
  kone: "img/players/kone.jpg",
  yacine: "img/players/yacine.jpg",
  mulla: "img/players/mulla.jpg",
  sano: "img/players/sano.jpg",
  mahana: "img/players/mahana.jpg",
  mahmood: "img/players/mahmood.jpg",
  mason: "img/players/mason.jpg",
  "yousef-saeed": "img/players/yousef-saeed.jpg",
  rasheed: "img/players/rasheed.jpg",
  sassi: "img/players/sassi.jpg",
  mustapha: "img/players/mustapha.jpg",
  "yousef-musa": "img/players/yousef-musa.jpg",
  "rayyan-hani": "img/players/rayyan-hani.jpg",
  saif: "img/players/saif.jpg",
};

/** id (utilisé par le kiosk) -> nom d'affichage. Copié tel quel : "ahmad" est bien Hamad, pas une erreur. */
var ROSTER = [
  { id: "ahmad", name: "Hamad" }, { id: "aladin", name: "Aladin" }, { id: "amjd", name: "Amjd" },
  { id: "amro", name: "Amro" }, { id: "ayoub", name: "Ayoub" }, { id: "bennacer", name: "Bennacer" },
  { id: "chalpan", name: "Chalpan" }, { id: "coman", name: "Coman" }, { id: "dame", name: "Dame" },
  { id: "fabricio", name: "Fabricio" }, { id: "fayez", name: "Fayez" }, { id: "frank", name: "Frank" },
  { id: "jamal", name: "Jamal" }, { id: "jamil", name: "Jamil" }, { id: "jang", name: "Jang" },
  { id: "khalifa", name: "Khalifa" }, { id: "mahana", name: "Mahana" }, { id: "kone", name: "Kone" },
  { id: "mahmood", name: "Mahmood" }, { id: "mason", name: "Mason" }, { id: "mulla", name: "Mulla" },
  { id: "mustapha", name: "Mustafa" }, { id: "ounas", name: "Ounas" }, { id: "rasheed", name: "Rasheed" },
  { id: "rayyan-ali", name: "Rayan Al Ali" }, { id: "rayyan-hani", name: "Rayyan Hani" }, { id: "saif", name: "Saif" },
  { id: "sano", name: "Sano" }, { id: "sassi", name: "Sassi" }, { id: "yacine", name: "Yacine" },
  { id: "yousef-musa", name: "Yousef Musa" }, { id: "yousef-saeed", name: "Yousef Saeed" },
];

var GOALKEEPER_IDS = ["ahmad", "khalifa", "mahmood", "kone"];
