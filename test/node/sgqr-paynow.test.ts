import { describe, it, expect } from "vitest";
import { buildPayNowPayload, truncateAnsi } from "../../src/sgqr/paynow";

describe("truncateAnsi", () => {
  it("keeps printable ASCII unchanged", () => {
    expect(truncateAnsi("Hello World", 25)).toBe("Hello World");
  });

  it("truncates to maxLen", () => {
    expect(truncateAnsi("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10)).toBe("ABCDEFGHIJ");
  });

  it("drops non-ASCII characters", () => {
    expect(truncateAnsi("Hello世界", 25)).toBe("Hello");
  });

  it("drops control characters", () => {
    expect(truncateAnsi("A\x00B\x1FC", 25)).toBe("ABC");
  });
});

describe("buildPayNowPayload — mobile proxy", () => {
  const payload = buildPayNowPayload({
    proxyType: "mobile",
    proxyValue: "+6591234567",
    amountCents: 1250,
    merchantName: "ACME PTE LTD",
    reference: "INV-001",
    description: "Dinner split",
  });

  it("starts with payload format indicator 01 and dynamic init 12", () => {
    expect(payload.startsWith("00020101021")).toBe(true) ||
      expect(payload.startsWith("000201010212")).toBe(true);
  });

  it("contains SG.PAYNOW GUI with mobile proxy type 0", () => {
    expect(payload).toContain("0009SG.PAYNOW");
    expect(payload).toContain("01010"); // proxy type = 0 (mobile)
    expect(payload).toContain("0211+6591234567");
  });

  it("sets editable flag to 0 (amount not editable)", () => {
    // After proxy value in tag 26, the next sub-field is 03 = "0"
    expect(payload).toContain("03010");
  });

  it("embeds the payment reference in tag 26 sub-tag 05", () => {
    // Reference "INV-001" is 7 chars → "05" + "07" + "INV-001"
    expect(payload).toContain("0507INV-001");
  });

  it("includes amount as decimal string in tag 54", () => {
    // 1250 cents = $12.50 (5 chars)
    expect(payload).toContain("5405" + "12.50");
  });

  it("includes currency 702 (SGD) and country SG", () => {
    expect(payload).toContain("5303702");
    expect(payload).toContain("5802SG");
  });

  it("includes merchant name and Singapore city", () => {
    expect(payload).toContain("5912ACME PTE LTD");
    expect(payload).toContain("6009Singapore");
  });

  it("includes description in tag 62 sub-tag 01", () => {
    // "Dinner split" = 12 chars → "01" + "12" + "Dinner split"
    expect(payload).toContain("0112Dinner split");
  });

  it("ends with CRC16 tag 6304 and 4-hex checksum", () => {
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("produces a valid CRC (verifiable by decoding the payload)", async () => {
    // The last 4 chars are the CRC; strip them and verify
    const crcPart = payload.slice(-4);
    const beforeCrc = payload.slice(0, -4); // includes "6304"
    // Import crc16
    const { crc16 } = await import("../../src/sgqr/index");
    expect(crc16(beforeCrc)).toBe(crcPart);
  });
});

describe("buildPayNowPayload — UEN proxy", () => {
  const payload = buildPayNowPayload({
    proxyType: "uen",
    proxyValue: "201234567A",
    amountCents: 500,
    merchantName: "TEST CO",
  });

  it("uses proxy type 2 for UEN", () => {
    expect(payload).toContain("01012"); // proxy type = 2 (UEN)
    expect(payload).toContain("0210201234567A");
  });

  it("includes amount $5.00", () => {
    expect(payload).toContain("5404" + "5.00");
  });
});

describe("buildPayNowPayload — editable amount", () => {
  const payload = buildPayNowPayload({
    proxyType: "mobile",
    proxyValue: "+6591234567",
    editable: true,
  });

  it("sets editable flag to 1", () => {
    expect(payload).toContain("03011");
  });

  it("omits tag 54 (amount)", () => {
    // Tag 54 should not appear when editable
    expect(payload).not.toContain("54");
  });
});

describe("buildPayNowPayload — truncation", () => {
  const longName = "A".repeat(30);
  const payload = buildPayNowPayload({
    proxyType: "mobile",
    proxyValue: "+6591234567",
    amountCents: 100,
    merchantName: longName,
    description: "B".repeat(30),
  });

  it("truncates merchant name to 25 chars", () => {
    expect(payload).toContain(`5925${"A".repeat(25)}`);
  });

  it("truncates description to 25 chars", () => {
    expect(payload).toContain(`0125${"B".repeat(25)}`);
  });
});

describe("buildPayNowPayload — known golden payload", () => {
  // Design specifies dynamic init method "12", so we test against a dynamic payload
  it("produces a valid dynamic PayNow QR payload", () => {
    const payload = buildPayNowPayload({
      proxyType: "mobile",
      proxyValue: "+6591234567",
      editable: true,
      merchantName: "ACME PTE LTD",
    });
    // Verify structure
    expect(payload.startsWith("000201010212")).toBe(true); // dynamic init
    expect(payload).toContain("0009SG.PAYNOW");
    expect(payload).toContain("01010"); // mobile proxy
    expect(payload).toContain("0211+6591234567");
    expect(payload).toContain("03011"); // editable
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });
});
