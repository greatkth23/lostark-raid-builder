import { describe, expect, it } from "vitest";
import { getLopecCharacterUrl } from "./lopec";

describe("getLopecCharacterUrl", () => {
  it("encodes Korean character names in the Lopec path", () => {
    expect(getLopecCharacterUrl("봄날꽃씨")).toBe(
      "https://lopec.kr/character/specPoint/%EB%B4%84%EB%82%A0%EA%BD%83%EC%94%A8",
    );
  });

  it("trims surrounding whitespace before building the URL", () => {
    expect(getLopecCharacterUrl(" 나츠노소라 ")).toBe(
      "https://lopec.kr/character/specPoint/%EB%82%98%EC%B8%A0%EB%85%B8%EC%86%8C%EB%9D%BC",
    );
  });
});
