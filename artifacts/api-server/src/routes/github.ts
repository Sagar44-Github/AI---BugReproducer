import { Router, type IRouter } from "express";
import { FetchGithubIssueBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Hard limits to prevent context window overflow
const MAX_COMMENT_BODY_CHARS = 400;   // per comment, before truncation
const MAX_TOTAL_COMMENT_CHARS = 5000; // total across all comments
const MAX_FORMATTED_CHARS = 14000;    // absolute ceiling on assembled rawInput

function parseGithubUrl(url: string): { owner: string; repo: string; issueNumber: number } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return null;
    // e.g. /owner/repo/issues/123
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 4 || parts[2] !== "issues") return null;
    const issueNumber = parseInt(parts[3], 10);
    if (isNaN(issueNumber)) return null;
    return { owner: parts[0], repo: parts[1], issueNumber };
  } catch {
    return null;
  }
}

// POST /github/fetch-issue
router.post("/github/fetch-issue", async (req, res): Promise<void> => {
  const parsed = FetchGithubIssueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const info = parseGithubUrl(parsed.data.url);
  if (!info) {
    res.status(400).json({ error: "Invalid GitHub issue URL. Expected format: https://github.com/owner/repo/issues/number" });
    return;
  }

  const { owner, repo, issueNumber } = info;

  try {
    // Fetch issue
    const issueRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "BugReproductionEngine/1.0",
        },
      }
    );

    if (issueRes.status === 404) {
      res.status(404).json({ error: "GitHub issue not found. Make sure the repository and issue number are correct." });
      return;
    }

    if (!issueRes.ok) {
      res.status(502).json({ error: `GitHub API error: ${issueRes.status} ${issueRes.statusText}` });
      return;
    }

    const issue = await issueRes.json() as {
      title: string;
      body: string | null;
      state: string;
      labels: { name: string }[];
      user: { login: string };
      html_url: string;
      number: number;
      comments: number;
    };

    // Fetch comments — up to 50 to handle large issues
    const commentsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=50`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "BugReproductionEngine/1.0",
        },
      }
    );

    let formattedComments: string[] = [];
    let truncated = false;
    let originalCommentCount = 0;

    if (commentsRes.ok) {
      const rawComments = await commentsRes.json() as {
        body: string | null;
        user: { login: string };
      }[];

      originalCommentCount = rawComments.length;
      const totalCommentChars = rawComments.reduce((sum, c) => sum + (c.body?.length ?? 0), 0);

      // If comments are large, truncate each body to avoid context overflow
      const perCommentLimit = totalCommentChars > MAX_TOTAL_COMMENT_CHARS
        ? MAX_COMMENT_BODY_CHARS
        : Infinity;

      if (totalCommentChars > MAX_TOTAL_COMMENT_CHARS) truncated = true;

      formattedComments = rawComments
        .map((c) => {
          const body = c.body ?? "";
          const truncatedBody = body.length > perCommentLimit
            ? body.slice(0, perCommentLimit) + `\n[… truncated ${body.length - perCommentLimit} chars]`
            : body;
          return `**${c.user.login}:** ${truncatedBody}`;
        })
        .filter((c) => c.length > 0);
    }

    // Build formatted output and hard-cap total length
    const rawFormatted = [
      `Title: ${issue.title}`,
      `State: ${issue.state}`,
      `Author: @${issue.user.login}`,
      `Labels: ${issue.labels.map((l) => l.name).join(", ") || "none"}`,
      `Total comments on issue: ${issue.comments}`,
      ``,
      `Description:`,
      issue.body ?? "(no description)",
      ``,
      `Comments (${formattedComments.length} of ${originalCommentCount || formattedComments.length} fetched):`,
      ...formattedComments,
    ].join("\n");

    let finalFormatted = rawFormatted;
    if (rawFormatted.length > MAX_FORMATTED_CHARS) {
      finalFormatted = rawFormatted.slice(0, MAX_FORMATTED_CHARS) +
        `\n\n[Input truncated to ${MAX_FORMATTED_CHARS} characters — ${rawFormatted.length - MAX_FORMATTED_CHARS} chars dropped to prevent context overflow]`;
      truncated = true;
    }

    logger.info(
      { owner, repo, issueNumber, commentCount: formattedComments.length, truncated, totalChars: finalFormatted.length },
      "GitHub issue fetched"
    );

    res.json({
      title: issue.title,
      body: issue.body ?? "",
      state: issue.state,
      labels: issue.labels.map((l) => l.name),
      comments: formattedComments,
      formattedContent: finalFormatted,
      truncated,
      originalCommentCount: originalCommentCount || formattedComments.length,
      url: issue.html_url,
      number: issue.number,
      author: issue.user.login,
    });
  } catch (err) {
    logger.error({ err }, "GitHub fetch error");
    res.status(502).json({ error: "Failed to fetch GitHub issue. The repository may be private or the URL is invalid." });
  }
});

export default router;
