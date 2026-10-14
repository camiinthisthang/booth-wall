import { expect, test } from "@playwright/test";

test("wall renders replacement features and pixel assembly line without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wall");
  await expect(
    page.getByRole("heading", { name: "THE BOOTH THAT BUILDS ITSELF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Live Votes" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Live Diff" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ticket to Live" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Start building" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /scan to open .*\/go\/detected/i }),
  ).toBeVisible();
  await expect(page.locator(".booth-start-building__qr")).toHaveAttribute(
    "data-qr-value",
    "http://127.0.0.1:3000/go/detected",
  );
  await expect(page.getByText("Factory Floor", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /pixel art assembly line/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Intake Chute, \d+ tickets/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Start building respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/wall");
  await expect(
    page.getByRole("region", { name: "Start building" }),
  ).toHaveAttribute("data-reduced-motion", "true");
  await expect(
    page.getByRole("region", { name: "Start building" }),
  ).toHaveAttribute("data-design", "detected");
});
