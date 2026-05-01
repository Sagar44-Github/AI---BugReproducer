import { Router, type IRouter } from "express";
import { FetchGithubIssueBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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
    };

    // Fetch comments
    const commentsRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=10`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "BugReproductionEngine/1.0",
        },
      }
    );

    let comments: string[] = [];
    if (commentsRes.ok) {
      const rawComments = await commentsRes.json() as { body: string | null; user: { login: string } }[];
      comments = rawComments
        .map(c => `**${c.user.login}:** ${c.body ?? ""}`)
        .filter(c => c.length > 0)
        .slice(0, 8);
    }

    res.json({
      title: issue.title,
      body: issue.body ?? "",
      state: issue.state,
      labels: issue.labels.map(l => l.name),
      comments,
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
