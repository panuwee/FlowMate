# Task Assign workspace implementation

Scope approved: existing version2.1.1 checkout; local changes and isolated verification only. No commit, production SQL, or publication is authorized.

## Design opening brief

Act as a senior product designer and systems designer extending the existing FlowMate shell. The product is Task Assign, for non-creative work shared by Marketing, Operations, and eSports. Preserve the current typography, spacing, cards, buttons, sidebar, light/dark colors, and responsive behavior. The audience is requesters and delivery teams who need to identify who asked for work, who owns delivery, what is expected, and when a commitment has been accepted. Keep creation short and make cross-team handoff explicit. Avoid duplicate tasks, ambiguous ownership, and silently assigning work to a person in another team.

Use one task identity across all team views. Add My work and a Workspace page to the existing navigation. My work defaults to assigned work across all authorized teams, with Created by me and an optional team filter. Workspace has Team work, Incoming requests, and Sent to other teams. Incoming requests belong to the receiving team's queue; an administrator or explicitly configured dispatcher accepts, requests more information, or rejects with a reason. On acceptance, require an active receiving-team assignee and a committed deadline. Keep the requested deadline visible alongside the commitment.

Creation requires an editable action-oriented title, note describing the deliverable, receiving team, deadline, and priority. Project and first review are optional. Urgent needs a reason. References are HTTP(S) links, using existing file links for attachments rather than introducing a new upload service. Auto-record requester and source workspace; validate membership server-side. For cross-team requests, replace personal assignment with the receiving-team queue and change the primary button to Send request. Render loading, empty, denied, error, and pending states with clear text. Every async action disables duplicate submission, preserves draft on failure, and refreshes after a successful write. Keep the mobile form in the existing responsive form grid. Protect comments, references, direct links, and search with the same database access rules.

## Data and rights

- `requester_team`: authorized source workspace; `owning_team_code`: receiving team.
- Request acceptance is separate from existing `work_status`.
- Normal task visibility: involved teams. Confidential: requester, assignee, selected collaborators, administrator.
- Dispatchers manage intake/reassignment. Assignee executes. Requester reviews delivery and edits the brief. Changes are audited.
- Separate deliverables can reference a common parent task; do not count one shared task twice.
- Existing Creative Request helpers and guards are preserved for non-quick tasks.
- Install the new SQL after existing Task Assign/workspace prerequisites. Configure team dispatchers before normal-team intake. Frontend must fail clearly when the backend upgrade is unavailable.
