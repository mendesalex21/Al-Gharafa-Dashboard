/**
 * Copié tel quel depuis l'ancien dashboard wellness (index.html du projet Apps Script
 * "Wellness Dashboard - Al-Gharafa"). Ne pas reformater les IDs Drive à la main.
 */
var PHOTO_DATA = {
  ounas: "https://drive.google.com/thumbnail?id=13OCrE4337JtHdnsa9GVhulMYPycISt7U&sz=w200",
  amjd: "https://drive.google.com/thumbnail?id=1iHU3CEyjDoR7h72KvsgIMxerEJptRTEJ&sz=w200",
  chalpan: "https://drive.google.com/thumbnail?id=1pcty-n5ev9fTw3lMlmE0_Sa3FDRi1cvT&sz=w200",
  jamal: "https://drive.google.com/thumbnail?id=1QpX-G7vXOYCO4a-byvB_AyK7xcTUMiaF&sz=w200",
  bennacer: "https://drive.google.com/thumbnail?id=13qAUMCIgfN_mHNh7dG9aMY4kddGVun8y&sz=w200",
  dame: "https://drive.google.com/thumbnail?id=1r0GpJxmpoEEEfxLTggPI9M1ae39uTNp0&sz=w200",
  fayez: "https://drive.google.com/thumbnail?id=1WMMvtsnKSZxDTYMtwCuiNw3GNRfIyrFI&sz=w200",
  ahmad: "https://drive.google.com/thumbnail?id=1SyZasKcuD-rqpUNv8q2tkrcnWCBYzoPs&sz=w200",
  aladin: "https://drive.google.com/thumbnail?id=1e_rDeCxSDwMvUQTiholt0oz1krgBYOk0&sz=w200",
  fabricio: "https://drive.google.com/thumbnail?id=1c24TbYTBaCgr7Nz-5wLLbpApq1gy0Izn&sz=w200",
  ayoub: "https://drive.google.com/thumbnail?id=1ebCAom_0k6ZWT-SfZKTwXg5KqK96O49n&sz=w200",
  frank: "https://drive.google.com/thumbnail?id=15GFuLESOzoXpVmF7lmfZPiZnmnvXiTSv&sz=w200",
  jamil: "https://drive.google.com/thumbnail?id=1wWMCDRkwZ5we7wi61qkkAt-9RyR_Iuwv&sz=w200",
  amro: "https://drive.google.com/thumbnail?id=1m4UdYycses2Akt3_NIIp3u670U66QLzP&sz=w200",
  jang: "https://drive.google.com/thumbnail?id=1_Q_6UJjf_mVENo4nhQ0hiSa63wulQqFR&sz=w200",
  coman: "https://drive.google.com/thumbnail?id=1acNwHAs0__66V4I21cCSOaRHty057XSQ&sz=w200",
  "rayyan-ali": "https://drive.google.com/thumbnail?id=1cpDBrp9oIr_DVbu_6WF8CeIS1ric_uze&sz=w200",
  khalifa: "https://drive.google.com/thumbnail?id=1zKetoavSX87Zkb51O0_WqKJwbGG0pqQc&sz=w200",
  kone: "https://drive.google.com/thumbnail?id=1pzJc_t2M0Oh2ER9-hJPgbAaNUG_yaJJU&sz=w200",
  yacine: "https://drive.google.com/thumbnail?id=1zzifBEBEcCmkhmlxgQeTQIgOWQmSoiEP&sz=w200",
  mulla: "https://drive.google.com/thumbnail?id=1Xi4hMpruGu0zPx5VXSh4hWkQU-QA_m5b&sz=w200",
  sano: "https://drive.google.com/thumbnail?id=18lobaiLq0tuk6rYP82AgEygzB-6dXmZS&sz=w200",
  mahana: "https://drive.google.com/thumbnail?id=17xKsctKWAdF1Zwml3Yz8JpFs0XIake16&sz=w200",
  mahmood: "https://drive.google.com/thumbnail?id=1MLYbvTpaTGNpf1_Wsp5M6-uceFaw3fCJ&sz=w200",
  mason: "https://drive.google.com/thumbnail?id=1aCAMQiMwl0RKLbfmZUVfgdFsadoaBW6r&sz=w200",
  "yousef-saeed": "https://drive.google.com/thumbnail?id=1FXGiCfh94X0ri_2pqTUKUuRzbWTED9Fv&sz=w200",
  rasheed: "https://drive.google.com/thumbnail?id=1EkF15ZyRKIMuz35hoacB5E4qVIZSOj88&sz=w200",
  sassi: "https://drive.google.com/thumbnail?id=1D9SLz83XtstI8VoS9g3mtvdSxz8mptYx&sz=w200",
  mustapha: "https://drive.google.com/thumbnail?id=1esJ2vWELWeB-9OXwPdH7tsnJi83D-xv9&sz=w200",
  "yousef-musa": "https://drive.google.com/thumbnail?id=1y8IcNkD6DANx6lC9j3rcze9loaQrtAK9&sz=w200",
  "rayyan-hani": "https://drive.google.com/thumbnail?id=18N3YD2H_qxPYC4TQQKUABvfMU5Ay1HIT&sz=w200",
  saif: "https://drive.google.com/thumbnail?id=1aVJ3GQ_AuwhnDDuufUBc2vYvap5yi4OQ&sz=w200",
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
