#!/usr/bin/env python3
"""Sends the pipeline e-mails: one when a run starts, one with the results at the end.

Python standard library only (smtplib), so nothing to install on the runner.
Everything comes in through environment variables (see notify-email.yml):

  PHASE            start | end
  SMTP_SERVER      e.g. smtp.office365.com      empty = don't send, only preview
  SMTP_PORT        587 (STARTTLS) or 465 (SSL)
  SMTP_SECURITY    starttls (default) | ssl | none (none = local test server only)
  SMTP_USERNAME    the mailbox that logs in
  SMTP_PASSWORD
  MAIL_FROM        default: SMTP_USERNAME. Office 365 only allows the login mailbox
  MAIL_TO          comma or semicolon separated
  MAIL_CC          optional

  end phase only:  STATUS TOTAL PASSED FAILED FLAKY SCAN_RESULT LEAKS DEPLOY_RESULT SANITY_RESULT
                   RESULTS_CSV (sanity-results.csv), GITLEAKS_REPORT (gitleaks-report.json)

The HTML is always written to PREVIEW_FILE (default email-preview.html), so you can
open it even when SMTP isn't set up yet.
"""
import csv
import html
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

env = lambda k, d="": (os.environ.get(k) or d).strip()
esc = lambda s: html.escape(str(s))

GREEN, RED, AMBER, BLUE, GREY = "#1a7f37", "#c62828", "#9a6700", "#1f5fbf", "#5d6675"
RESULT_COLOR = {"success": GREEN, "failure": RED, "cancelled": AMBER, "skipped": GREY}
TEST_COLOR = {"Pass": GREEN, "Fail": RED, "Flaky": AMBER, "Not Run": GREY}


def badge(text, color):
    return (f'<span style="background:{color};color:#fff;padding:2px 8px;border-radius:4px;'
            f'font-size:12px;font-weight:600;white-space:nowrap">{esc(text)}</span>')


def table(headers, rows):
    th = "".join(f'<th style="text-align:left;padding:6px 8px;background:#eef2f8;border:1px solid #dde1e7">{esc(h)}</th>' for h in headers)
    body = ""
    for r in rows:
        # A cell is plain text, or ("html", "<span>...") for something already built
        tds = "".join(
            f'<td style="padding:6px 8px;border:1px solid #dde1e7;vertical-align:top">{c[1] if isinstance(c, tuple) else esc(c)}</td>'
            for c in r)
        body += f"<tr>{tds}</tr>"
    head = f"<tr>{th}</tr>" if th else ""
    return f'<table style="border-collapse:collapse;font-size:13px;margin:6px 0 16px">{head}{body}</table>'


def section(title):
    return f'<h3 style="font-size:15px;margin:18px 0 6px">{esc(title)}</h3>'


def run_details():
    sha = env("SHA")
    rows = [
        ("Repository", env("REPO")),
        ("Trigger", env("TRIGGER")),
        ("Started by", env("ACTOR")),
        ("Branch", env("BRANCH")),
        ("Commit", f"{sha[:7]}  {env('COMMIT_MSG').splitlines()[0] if env('COMMIT_MSG') else ''}".strip()),
        ("Target", env("TARGET", "n/a")),
        ("Tests open", env("BASE_URL", "app started inside the job")),
    ]
    return table([], [r for r in rows if r[1]])


def page(title, color, inner):
    run_url = env("RUN_URL")
    button = (f'<p><a href="{esc(run_url)}" style="display:inline-block;background:{BLUE};color:#fff;'
              f'text-decoration:none;padding:8px 16px;border-radius:6px;font-weight:600">Open the run on GitHub</a></p>') if run_url else ""
    return f"""<!DOCTYPE html><html><body style="margin:0;background:#f6f7f9">
<div style="max-width:760px;margin:0 auto;font:14px/1.5 Segoe UI,Arial,sans-serif;color:#1d2330">
<div style="background:{color};color:#fff;padding:14px 18px;font-size:18px;font-weight:600">{esc(title)}</div>
<div style="background:#fff;padding:12px 18px 18px;border:1px solid #dde1e7;border-top:0">
{inner}{button}
<p style="color:{GREY};font-size:12px">Sent automatically by GitHub Actions ({esc(env('WORKFLOW'))} #{esc(env('RUN_NUMBER'))}).</p>
</div></div></body></html>"""


def start_mail():
    subject = f"▶️ Sanity run started: {env('REPO').split('/')[-1]} ({env('TRIGGER')}, by {env('ACTOR')})"
    inner = "<p>A sanity run has started. You'll get a second e-mail with the results when it finishes.</p>"
    inner += section("Run") + run_details()
    return subject, page("▶️ Sanity run started", BLUE, inner), []


def read_tests(path):
    if not path or not Path(path).is_file():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))[1:]   # skip the header row


def read_leaks(path):
    if not path or not Path(path).is_file():
        return []
    try:
        return json.loads(Path(path).read_text(encoding="utf-8")) or []
    except ValueError:
        return []


def end_mail():
    scan, deploy, sanity = env("SCAN_RESULT"), env("DEPLOY_RESULT"), env("SANITY_RESULT")
    status, leaks = env("STATUS"), env("LEAKS")
    # No status = the tests never ran (secrets found, deploy failed, cancelled, setup error)
    if not status and scan == "failure":
        status = f"NOT RUN ({leaks or '?'} secret(s) found)"
    elif not status and deploy == "failure":
        status = "NOT RUN (deploy failed)"
    status = status or f"NOT RUN ({sanity or 'unknown'})"
    icon, color = {"PASSED": ("✅", GREEN), "FAILED": ("❌", RED)}.get(status, ("⚠️", AMBER))

    total, passed, failed, flaky = env("TOTAL", "0"), env("PASSED", "0"), env("FAILED", "0"), env("FLAKY", "0")
    counts = f"{passed}/{total} passed, " if status in ("PASSED", "FAILED") else ""
    subject = f"{icon} Sanity {status}: {counts}{env('REPO').split('/')[-1]} ({env('BRANCH')})"

    inner = section("Pipeline")
    stages = [("Secret scan (Gitleaks)", scan), ("Deploy", deploy), ("Sanity tests", sanity)]
    inner += table(["Stage", "Result"], [(n, ("html", badge(r or "n/a", RESULT_COLOR.get(r, GREY)))) for n, r in stages])

    inner += section("Tests")
    if status in ("PASSED", "FAILED"):
        inner += table(["Total", "Passed", "Failed", "Flaky"], [(total, passed, failed, flaky)])
    tests = read_tests(env("RESULTS_CSV"))
    if tests:
        # Failures first, so they're the first thing you read
        tests.sort(key=lambda r: {"Fail": 0, "Flaky": 1}.get(r[2], 2))
        inner += table(["ID", "Scenario", "Result", "Actual result / remarks"],
                       [(("html", f'<span style="white-space:nowrap">{esc(r[0])}</span>'), r[1], ("html", badge(r[2], TEST_COLOR.get(r[2], GREY))), r[3]) for r in tests])
    else:
        inner += "<p>No per-test results (the tests didn't run).</p>"

    inner += section("Secret scan")
    found = read_leaks(env("GITLEAKS_REPORT"))
    if found:
        inner += f"<p>{badge(f'{len(found)} secret(s) found', RED)} The values are redacted.</p>"
        inner += table(["Rule", "File", "Line", "Commit", "Author"],
                       [(f.get("RuleID", ""), f.get("File", ""), f.get("StartLine", ""), str(f.get("Commit", ""))[:7], f.get("Author", ""))
                        for f in found[:50]])
        if len(found) > 50:
            inner += f"<p>… and {len(found) - 50} more. Full list in the gitleaks-report artifact.</p>"
    elif scan == "success":
        inner += f"<p>{badge('No secrets found', GREEN)}</p>"
    else:
        inner += f"<p>Scan result: {esc(scan or 'n/a')}</p>"

    inner += section("Run") + run_details()
    inner += "<p>HTML report with screenshots, video and trace: the <b>playwright-report</b> artifact on the run page.</p>"

    attachments = [p for p in (env("RESULTS_CSV"),) if p and Path(p).is_file()]
    return subject, page(f"{icon} Sanity tests {status}", color, inner), attachments


def recipients(value):
    return [a.strip() for a in value.replace(";", ",").split(",") if a.strip()]


def summary(line):
    print(line)
    if env("GITHUB_STEP_SUMMARY"):
        with open(env("GITHUB_STEP_SUMMARY"), "a", encoding="utf-8") as f:
            f.write(line + "\n\n")


def main():
    phase = env("PHASE", "end")
    if phase not in ("start", "end"):
        sys.exit(f"PHASE must be start or end, got '{phase}'")
    subject, body, attachments = start_mail() if phase == "start" else end_mail()

    preview = env("PREVIEW_FILE", "email-preview.html")
    Path(preview).write_text(body, encoding="utf-8")

    server, user, password = env("SMTP_SERVER"), env("SMTP_USERNAME"), env("SMTP_PASSWORD")
    to, cc = recipients(env("MAIL_TO")), recipients(env("MAIL_CC"))
    if not (server and to):
        print(f"::notice::E-mail not configured (SMTP_SERVER / MAIL_TO). Subject would be: {subject}")
        summary(f"### 📧 E-mail ({phase}): not configured\nWould send: **{subject}**. Preview: the email-preview artifact.")
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = env("MAIL_FROM", user)
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg.set_content(f"{subject}\n\nOpen the run: {env('RUN_URL')}\n\n(This e-mail is best viewed as HTML.)")
    msg.add_alternative(body, subtype="html")
    for p in attachments:
        msg.add_attachment(Path(p).read_bytes(), maintype="text", subtype="csv", filename=Path(p).name)

    port = int(env("SMTP_PORT", "587"))
    security = env("SMTP_SECURITY", "starttls").lower()
    context = ssl.create_default_context()
    try:
        if security == "ssl":
            smtp = smtplib.SMTP_SSL(server, port, timeout=30, context=context)
        else:
            smtp = smtplib.SMTP(server, port, timeout=30)
            if security == "starttls":
                smtp.starttls(context=context)   # Office 365 only offers login after this
        with smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg, to_addrs=to + cc)
    except (smtplib.SMTPException, OSError) as e:
        # The common Office 365 errors, in plain words
        hints = {
            "5.7.139": "basic authentication (username/password) is disabled for this tenant or mailbox",
            "5.7.3": "wrong username/password, or SMTP AUTH is turned off for this mailbox",
            "5.7.57": "not authenticated: check the username and that STARTTLS is used",
            "5.7.60": "MAIL_FROM must be the login mailbox (or the login needs Send As rights)",
        }
        hint = next((h for code, h in hints.items() if code in str(e)), "")
        if not hint and "535" in str(e):
            hint = "the server refused the login: check SMTP_USERNAME / SMTP_PASSWORD"
        print(f"::error::Sending the {phase} e-mail failed: {e}" + (f" ({hint})" if hint else ""))
        summary(f"### 📧 E-mail ({phase}): ❌ failed\n`{e}`" + (f"\n\n{hint}" if hint else ""))
        sys.exit(1)

    # Only the count: the run summary can be read by anyone who can see the repo
    summary(f"### 📧 E-mail ({phase}): sent\n**{subject}** → {len(to + cc)} recipient(s)")


if __name__ == "__main__":
    main()
