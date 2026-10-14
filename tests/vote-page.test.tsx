import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vote } from "@/app/vote/vote";

describe("Vote page", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/api/github/summary")
          ? { mergedToday: 7 }
          : { configured: true, issues: [] };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(body),
        } as Response);
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains how a vote becomes a shipped wall change", async () => {
    render(<Vote />);

    expect(
      screen.getByRole("heading", { name: /what should we build next\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Every idea below is a real ticket\. Vote, and an autonomous Droid takes it from there/,
      ),
    ).toBeInTheDocument();

    const flow = screen.getByRole("list", {
      name: "How your vote reaches the wall",
    });
    expect(within(flow).getAllByRole("listitem")).toHaveLength(4);
    expect(within(flow).getByText("You vote")).toBeInTheDocument();
    expect(within(flow).getByText("A Droid claims the ticket")).toBeInTheDocument();
    expect(within(flow).getByText("Code, tests, and checks")).toBeInTheDocument();
    expect(within(flow).getByText("Live on the wall")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("This booth has shipped 7 changes today"),
      ).toBeInTheDocument();
    });
  });

  it("restores and remembers the optional screen name", async () => {
    localStorage.setItem("booth-screen-name", "maya");
    render(<Vote />);

    const input = await screen.findByRole("textbox", {
      name: /screen name/i,
    });
    await waitFor(() => expect(input).toHaveValue("maya"));
    expect(input).toHaveAttribute("maxlength", "20");

    fireEvent.change(input, { target: { value: "nova" } });
    expect(localStorage.getItem("booth-screen-name")).toBe("nova");
  });
});
