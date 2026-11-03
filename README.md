# AuditFlow — Internal Audit Management

Client-wise internal audit management application. The initial foundation includes a responsive dashboard, Supabase email/password authentication, client and engagement creation, task creation, task register, team workload and CSV export.

## Technology
- HTML, CSS and JavaScript (ES modules)
- Supabase Auth
- Supabase PostgreSQL with Row Level Security (RLS)

## Setup
1. Create a Supabase project.
2. Open the SQL Editor and run `supabase/migrations/001_initial_schema.sql`.
3. In Supabase Authentication, enable Email provider and create the first user.
4. In SQL Editor, promote that user to admin by running:
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
   ```
   (The profile row is created automatically after the user's first sign-in; if it does not yet exist, sign in once, then run this statement.)
5. Copy the Project URL and publishable/anon key into `assets/js/config.js`.
6. Serve the repository using GitHub Pages or another static host. ES modules and Supabase require HTTP(S); opening the HTML as a local file may not work.
7. Keep this repository private before adding production configuration or any client-related material.

## Security
- Only the Supabase publishable/anon key belongs in browser code.
- Never expose the Supabase service_role key, database password, or other server secrets.
- RLS is enabled on all application tables. Client access is controlled through client memberships; admin users have firm-wide access.
- The first admin must be promoted by a trusted project owner in the Supabase SQL editor.

## Current scope and limitations
This is the initial foundation build. It does not yet include a full employee invitation screen, task reassignment workflow, timesheets, PBC uploads, observation lifecycle, notifications, or immutable audit-event triggers. These are planned follow-on modules. Configure Supabase and test RLS with separate accounts before using real audit data.
