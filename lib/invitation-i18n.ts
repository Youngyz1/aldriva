/**
 * lib/invitation-i18n.ts
 *
 * Typed localization dictionaries and formatting helpers for Aldriva Invitation Templates.
 * Supports EN (English) and FR (French).
 * Only translates Aldriva UI strings (headings, labels, countdown, RSVP actions, subtypes).
 * Host-supplied narrative content is NEVER machine-translated.
 */

export type InvitationLocale = "en" | "fr";

export interface InvitationDictionary {
  // Common
  youAreInvited: string;
  exclusiveInvitation: string;
  exploreInvitation: string;
  celebrationUnderway: string;
  poweredByAldriva: string;

  // Countdown units
  days: string;
  hours: string;
  minutes: string;
  seconds: string;

  // Section labels & titles
  messageFromHost: string;
  orderOfEvents: string;
  itineraryAndProgram: string;
  locationAndTravel: string;
  venueAndDirections: string;
  venues: string;
  getDirections: string;
  directions: string;
  parkingAndArrival: string;
  importantInfo: string;
  attireGuidelines: string;
  attire: string;
  colorsOfTheDay: string;
  recommendedAccommodations: string;
  recommendedStays: string;
  book: string;
  visualHighlights: string;
  galleryAndMemories: string;
  gallery: string;
  capturedMoments: string;
  giftRegistry: string;
  registryNoteTitle: string;
  whereToStay: string;
  chapterByChapter: string;
  ourStory: string;
  whenAndWhere: string;
  ceremonyAndCelebration: string;
  needToKnow: string;
  partyDetails: string;
  partyLineup: string;
  when: string;
  location: string;
  timeline: string;

  // Guest & VIP greetings
  dearGuest: string;
  dearest: string;
  honoredVipGuest: string;
  honoredWeddingGuest: string;
  vipPartyGuest: string;
  welcomeFriend: string;

  // RSVP & Pass
  yourInvitationAndRsvp: string;
  officialGuestPass: string;
  vipGuestPass: string;
  officialInvitation: string;
  officialResponse: string;
  officialPartyPass: string;
  vipPartyPass: string;
  kindlyConfirm: string;
  kindlyRespond: string;
  claimYourSpot: string;
  willYouJoinUs: string;
  willYouCelebrate: string;
  areYouComing: string;
  accept: string;
  decline: string;
  attending: string;
  declined: string;
  joyfullyAccept: string;
  regretfullyDecline: string;
  joyfullyAttending: string;
  regretfullyDeclined: string;
  countMeIn: string;
  cantMakeIt: string;
  assignedSeat: string;
  reservedSeat: string;
  table: string;
  scanForAdmission: string;
  scanAtDoor: string;
  presentForAdmission: string;

  // Feedback messages
  attendanceConfirmed: string;
  responseNoted: string;
  weddingJoyReceived: string;
  weddingResponseNoted: string;
  birthdayConfirmed: string;
  birthdayDeclined: string;
  previewConfirmed: string;
  previewDeclined: string;

  // Actions
  addToCalendar: string;
  downloadIcal: string;
  googleCalendar: string;
  share: string;
  copiedLink: string;
  music: string;
  playing: string;

  // Wedding Subtypes
  subtypes: {
    church: { eyebrow: string; ceremony: string; reception: string };
    civil: { eyebrow: string; ceremony: string; reception: string };
    traditional: { eyebrow: string; ceremony: string; reception: string };
    engagement: { eyebrow: string; ceremony: string; reception: string };
    vow_renewal: { eyebrow: string; ceremony: string; reception: string };
    default: { eyebrow: string; ceremony: string; reception: string };
  };
}

export const INVITATION_I18N: Record<InvitationLocale, InvitationDictionary> = {
  en: {
    youAreInvited: "You're Invited",
    exclusiveInvitation: "An Exclusive Invitation",
    exploreInvitation: "Explore Invitation",
    celebrationUnderway: "The celebration is underway.",
    poweredByAldriva: "Powered by Aldriva Digital Invitations",

    days: "Days",
    hours: "Hours",
    minutes: "Min",
    seconds: "Sec",

    messageFromHost: "A Message from the Host",
    orderOfEvents: "Order of Events",
    itineraryAndProgram: "Itinerary & Program",
    locationAndTravel: "Location & Travel",
    venueAndDirections: "Venue & Directions",
    venues: "Venues",
    getDirections: "Get Directions",
    directions: "Directions",
    parkingAndArrival: "Parking & Arrival",
    importantInfo: "Important Information",
    attireGuidelines: "Attire Guidelines",
    attire: "Attire",
    colorsOfTheDay: "Colors of the Day",
    recommendedAccommodations: "Recommended Accommodations",
    recommendedStays: "Recommended Stays",
    book: "Book",
    visualHighlights: "Visual Highlights",
    galleryAndMemories: "Gallery & Memories",
    gallery: "Gallery",
    capturedMoments: "Captured Moments",
    giftRegistry: "Gift Registry & Wishing Well",
    registryNoteTitle: "Gift Registry",
    whereToStay: "Where to Stay",
    chapterByChapter: "Chapter By Chapter",
    ourStory: "Our Story",
    whenAndWhere: "When & Where",
    ceremonyAndCelebration: "Ceremony & Celebration",
    needToKnow: "Need to Know",
    partyDetails: "Party Details & Vibe",
    partyLineup: "Party Lineup",
    when: "When",
    location: "Location",
    timeline: "Timeline",

    dearGuest: "Dear Guest",
    dearest: "Dearest",
    honoredVipGuest: "Honored VIP Guest",
    honoredWeddingGuest: "Honored Wedding Guest",
    vipPartyGuest: "⭐ VIP Party Guest ⭐",
    welcomeFriend: "Welcome, Friend!",

    yourInvitationAndRsvp: "Your Invitation & RSVP",
    officialGuestPass: "Official Guest Pass",
    vipGuestPass: "VIP Honored Guest Pass",
    officialInvitation: "Official Invitation",
    officialResponse: "Official Response",
    officialPartyPass: "Official Party Pass",
    vipPartyPass: "⭐ VIP Party Pass ⭐",
    kindlyConfirm: "Kindly confirm your attendance. Your digital pass is ready below.",
    kindlyRespond: "Please reply at your earliest convenience so we may reserve your place.",
    claimYourSpot: "Claim Your Spot",
    willYouJoinUs: "Will you be joining us?",
    willYouCelebrate: "Will you be celebrating with us?",
    areYouComing: "Are you coming to celebrate?",
    accept: "Accept Invitation",
    decline: "Unable to Attend",
    attending: "You're Attending",
    declined: "Declined",
    joyfullyAccept: "Joyfully Accept",
    regretfullyDecline: "Regretfully Decline",
    joyfullyAttending: "Joyfully Attending",
    regretfullyDeclined: "Regretfully Declined",
    countMeIn: "Count Me In! 🎉",
    cantMakeIt: "Can't Make It 😢",
    assignedSeat: "Assigned",
    reservedSeat: "Reserved",
    table: "Table",
    scanForAdmission: "Scan for admission at door",
    scanAtDoor: "Scan at Door for Admission",
    presentForAdmission: "Present for admission",

    attendanceConfirmed: "Your attendance has been confirmed. We look forward to welcoming you.",
    responseNoted: "Your response has been noted. Thank you for letting us know.",
    weddingJoyReceived: "Your joy has been received! We cannot wait to celebrate with you.",
    weddingResponseNoted: "Your response has been noted with warm appreciation. Thank you.",
    birthdayConfirmed: "You're in! Get ready for an unforgettable birthday celebration!",
    birthdayDeclined: "We'll miss you! Thanks for letting us know.",
    previewConfirmed: "Attendance confirmed (preview mode).",
    previewDeclined: "Declined response recorded (preview mode).",

    addToCalendar: "Add to Calendar",
    downloadIcal: "Download iCal (.ics)",
    googleCalendar: "Google Cal",
    share: "Share",
    copiedLink: "Copied!",
    music: "Music",
    playing: "Playing",

    subtypes: {
      church: {
        eyebrow: "The Holy Matrimony Of",
        ceremony: "Church Ceremony",
        reception: "Wedding Banquet",
      },
      civil: {
        eyebrow: "The Marriage Celebration Of",
        ceremony: "Civil Ceremony",
        reception: "Dinner Reception",
      },
      traditional: {
        eyebrow: "Traditional Wedding Rites Of",
        ceremony: "Traditional Ceremony",
        reception: "Evening Reception",
      },
      engagement: {
        eyebrow: "The Engagement & Introduction Of",
        ceremony: "Betrothal & Blessing",
        reception: "Celebration Dinner",
      },
      vow_renewal: {
        eyebrow: "The Vow Renewal Of",
        ceremony: "Vow Renewal Ceremony",
        reception: "Anniversary Reception",
      },
      default: {
        eyebrow: "The Wedding Celebration Of",
        ceremony: "The Ceremony",
        reception: "The Reception",
      },
    },
  },
  fr: {
    youAreInvited: "Vous êtes invité(e)",
    exclusiveInvitation: "Une invitation exclusive",
    exploreInvitation: "Découvrir l'invitation",
    celebrationUnderway: "La célébration a commencé.",
    poweredByAldriva: "Propulsé par les invitations numériques Aldriva",

    days: "Jours",
    hours: "Heures",
    minutes: "Min",
    seconds: "Sec",

    messageFromHost: "Un message de l'hôte",
    orderOfEvents: "Déroulement de l'événement",
    itineraryAndProgram: "Programme & Itinéraire",
    locationAndTravel: "Lieu & Accès",
    venueAndDirections: "Lieu & Itinéraire",
    venues: "Lieux",
    getDirections: "Voir l'itinéraire",
    directions: "Itinéraire",
    parkingAndArrival: "Parking & Accès",
    importantInfo: "Informations importantes",
    attireGuidelines: "Code vestimentaire",
    attire: "Tenue",
    colorsOfTheDay: "Couleurs du jour",
    recommendedAccommodations: "Hébergements recommandés",
    recommendedStays: "Où séjourner",
    book: "Réserver",
    visualHighlights: "Moments choisis",
    galleryAndMemories: "Galerie & Souvenirs",
    gallery: "Galerie",
    capturedMoments: "Instants précieux",
    giftRegistry: "Liste de mariage & Cagnotte",
    registryNoteTitle: "Liste de cadeaux",
    whereToStay: "Hébergements",
    chapterByChapter: "Notre histoire",
    ourStory: "Notre histoire",
    whenAndWhere: "Date & Lieu",
    ceremonyAndCelebration: "Cérémonie & Réception",
    needToKnow: "À savoir",
    partyDetails: "Détails & Ambiance",
    partyLineup: "Programme de la fête",
    when: "Quand",
    location: "Où",
    timeline: "Planning",

    dearGuest: "Cher(e) invité(e)",
    dearest: "Très cher(e)",
    honoredVipGuest: "Invité(e) d'honneur VIP",
    honoredWeddingGuest: "Invité(e) d'honneur",
    vipPartyGuest: "⭐ Invité(e) VIP ⭐",
    welcomeFriend: "Bienvenue !",

    yourInvitationAndRsvp: "Votre invitation & Confirmation",
    officialGuestPass: "Pass d'accès officiel",
    vipGuestPass: "Pass d'honneur VIP",
    officialInvitation: "Invitation officielle",
    officialResponse: "Réponse officielle",
    officialPartyPass: "Pass d'entrée à la fête",
    vipPartyPass: "⭐ Pass VIP pour la fête ⭐",
    kindlyConfirm: "Veuillez confirmer votre présence ci-dessous. Votre pass numérique est prêt.",
    kindlyRespond: "Merci de bien vouloir répondre afin que nous puissions réserver votre place.",
    claimYourSpot: "Confirmez votre place",
    willYouJoinUs: "Serez-vous parmi nous ?",
    willYouCelebrate: "Serez-vous des nôtres pour célébrer ?",
    areYouComing: "Venez-vous faire la fête ?",
    accept: "Accepter l'invitation",
    decline: "Ne peut pas venir",
    attending: "Présent(e)",
    declined: "Décliné(e)",
    joyfullyAccept: "Accepte avec joie",
    regretfullyDecline: "Décline avec regret",
    joyfullyAttending: "Sera présent(e) avec joie",
    regretfullyDeclined: "A décliné avec regret",
    countMeIn: "Je viens ! 🎉",
    cantMakeIt: "Impossible de venir 😢",
    assignedSeat: "Place attribuée",
    reservedSeat: "Place réservée",
    table: "Table",
    scanForAdmission: "Scannez à l'entrée",
    scanAtDoor: "Scannez à la porte pour entrer",
    presentForAdmission: "Présentez ce pass à l'entrée",

    attendanceConfirmed: "Votre présence est confirmée. Nous avons hâte de vous accueillir.",
    responseNoted: "Votre réponse a été enregistrée. Merci de nous avoir prévenus.",
    weddingJoyReceived: "Votre réponse est bien reçue ! Nous nous réjouissons de célébrer avec vous.",
    weddingResponseNoted: "Votre réponse a été prise en compte avec gratitude. Merci.",
    birthdayConfirmed: "Super ! Préparez-vous à une fête d'anniversaire mémorable !",
    birthdayDeclined: "Vous allez nous manquer ! Merci pour votre réponse.",
    previewConfirmed: "Présence confirmée (mode aperçu).",
    previewDeclined: "Réponse négative enregistrée (mode aperçu).",

    addToCalendar: "Ajouter au calendrier",
    downloadIcal: "Télécharger iCal (.ics)",
    googleCalendar: "Google Agenda",
    share: "Partager",
    copiedLink: "Lien copié !",
    music: "Musique",
    playing: "Lecture",

    subtypes: {
      church: {
        eyebrow: "Le Mariage Religieux De",
        ceremony: "Cérémonie Religieuse",
        reception: "Banquet de Mariage",
      },
      civil: {
        eyebrow: "La Célébration du Mariage De",
        ceremony: "Cérémonie Civile",
        reception: "Dîner de Réception",
      },
      traditional: {
        eyebrow: "Le Mariage Coutumier De",
        ceremony: "Cérémonie Traditionnelle",
        reception: "Soirée de Réception",
      },
      engagement: {
        eyebrow: "Les Fiançailles & Présentation De",
        ceremony: "Bénédiction & Fiançailles",
        reception: "Dîner de Célébration",
      },
      vow_renewal: {
        eyebrow: "Le Renouvellement de Vœux De",
        ceremony: "Cérémonie de Renouvellement",
        reception: "Soirée Anniversaire",
      },
      default: {
        eyebrow: "Le Mariage De",
        ceremony: "La Cérémonie",
        reception: "La Réception",
      },
    },
  },
};

export function getInvitationDictionary(locale: InvitationLocale = "en"): InvitationDictionary {
  return INVITATION_I18N[locale] || INVITATION_I18N.en;
}

/**
 * Locale-aware date and time formatting
 */
export function formatLocalizedEventDate(
  dateIso: string,
  locale: InvitationLocale = "en",
  timezone?: string | null
): { dateDisplay: string; timeDisplay: string } {
  if (!dateIso) return { dateDisplay: "Date TBA", timeDisplay: "Time TBA" };

  try {
    const d = new Date(dateIso);
    const localeCode = locale === "fr" ? "fr-FR" : "en-US";
    const tzOptions: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {};

    const dateStr = d.toLocaleDateString(localeCode, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      ...tzOptions,
    });

    const timeStr = d.toLocaleTimeString(localeCode, {
      hour: "numeric",
      minute: "2-digit",
      ...tzOptions,
    });

    const tzAbbr = timezone
      ? d.toLocaleTimeString("en-US", { timeZoneName: "short", ...tzOptions }).split(" ").pop()
      : "";

    return {
      dateDisplay: dateStr.charAt(0).toUpperCase() + dateStr.slice(1),
      timeDisplay: tzAbbr ? `${timeStr} ${tzAbbr}` : timeStr,
    };
  } catch {
    return { dateDisplay: "Date TBA", timeDisplay: "Time TBA" };
  }
}
