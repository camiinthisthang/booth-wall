import { expect, test } from "@playwright/test";

test("wall renders its title and construction grid without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/wall");
  await expect(
    page.getByRole("heading", { name: "THE BOOTH THAT BUILDS ITSELF" }),
  ).toBeVisible();
  await expect(page.getByText("Under construction").first()).toBeVisible();
  await expect(page.getByText("Factory Floor", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Backlog, \d+ tickets/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
