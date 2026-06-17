<!--
How release notes work:

Save the notes for a release as release-notes/vX.Y.Z.md BEFORE tagging vX.Y.Z.
The "Release images" workflow uses this file as the GitHub Release body so users
see clean, human notes instead of a raw commit list. If no file exists for the
tag, the workflow falls back to auto-generated notes from the commit history.

Writing guidance:
- Write for site owners and editors, not for developers. Lead with what changed
  for them, in plain language.
- Keep it short. A few bullets is plenty for most releases.
- For routine bug-fix releases, general language is fine, the way large apps do
  it: "Various stability and performance improvements." Call out anything a user
  would actually notice by name.
- No em dashes. Use commas, colons, semicolons, or periods.

Delete this comment block when you copy the template.
-->

## Highlights

One or two sentences on the headline change in this release.

## What's new

- Feature: a short, benefit-first description of what it does for the user.

## Fixes and improvements

- A user-visible fix, described in terms of what the user will notice.
- General stability and performance improvements.
