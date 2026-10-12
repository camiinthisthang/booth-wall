import { expect, test } from "@playwright/test";

test("wall renders all three replacement features without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wall");
  await expect(
    page.getByRole("heading", { name: "THE BOOTH THAT BUILDS ITSELF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Caught at the Gate" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Live Diff" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ticket to Live" }),
  ).toBeVisible();
  await expect(page.getByText("Factory Floor", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Backlog, \d+ tickets/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
