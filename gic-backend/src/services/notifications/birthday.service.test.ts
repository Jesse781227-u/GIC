import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/postgres";

test("birthdayCelebration includes dynamic member data and reusable template metadata", async () => {
  const { birthdayCelebration, BIRTHDAY_ROUTE } = await import("./birthday.service.js");

  const member = {
    id: "member-123",
    churchId: "church-abc",
    displayName: "Ada Okafor",
    birthday: "04-12",
    avatar: "https://example.com/avatar.jpg",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const celebration = birthdayCelebration(member, { year: 2026, month: 4, day: 12 });

  assert.ok(celebration);
  assert.equal(celebration.memberId, "member-123");
  assert.equal(celebration.firstName, "Ada");
  assert.equal(celebration.fullName, "Ada Okafor");
  assert.equal(celebration.profileImage, "https://example.com/avatar.jpg");
  assert.equal(celebration.destinationUrl, BIRTHDAY_ROUTE);
  assert.ok(celebration.template);
  assert.ok(celebration.scripture?.reference);
  assert.ok(celebration.scripture?.text);
  assert.ok(celebration.message.includes("Ada") || celebration.message.includes("Ada Okafor"));
});
