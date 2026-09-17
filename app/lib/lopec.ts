const LOPEC_CHARACTER_URL = "https://lopec.kr/character/specPoint/";

export const getLopecCharacterUrl = (characterName: string) =>
  `${LOPEC_CHARACTER_URL}${encodeURIComponent(characterName.trim())}`;
