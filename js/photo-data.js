/**
 * Players' photos: filled in after sign-in from the private "player_photos" payload (sync/build.py downloads them once from
 * the Drive links kept on the staff PC, sync/photo_sources.json). No link here: this file is public.
 */
var PHOTO_DATA = {};

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
