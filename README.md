# AuditFlow

AuditFlow is a lightweight internal audit workspace built with static HTML/CSS/JavaScript, Firebase Authentication, and Firebase Realtime Database. It provides Google sign-in, admin-managed employee roles, clients, audit engagements, task assignment and tracking, team workload, and CSV task export.

## Free-service scope

- Use the existing Firebase project `internal-audit-c5e0b` on the **Spark (no-cost) plan**.
- Uses Firebase Authentication and Realtime Database only.
- No Cloud Functions, Firebase Storage, phone authentication, paid hosting, or Blaze billing setup.
- Firebase Hosting is optional and has a Spark no-cost quota; GitHub Pages or another static host also works.
- The Firebase browser config in `assets/js/config.js` is public client configuration. Realtime Database rules provide access control; the API key is not an authorization secret.

## Firebase console setup (one-time)

1. In Firebase Console, confirm project `internal-audit-c5e0b` remains on **Spark**. Do not enable billing or upgrade to Blaze.
2. In **Authentication → Sign-in method**, enable **Google** and select the support email.
3. In **Authentication → Settings → Authorized domains**, add the domain where the app will be served (for example, your GitHub Pages domain or `localhost` for local development).
4. In **Realtime Database**, create the database in the region you prefer. The configured URL is `https://internal-audit-c5e0b-default-rtdb.firebaseio.com`; confirm that the database actually uses this URL.
5. Create the first administrator account by signing into the app once with the Google account that will own AuditFlow. In Authentication → Users, copy that user's UID.
6. Open `database.rules.json` and replace every `REPLACE_WITH_ADMIN_UID` with that exact UID. This UID bootstrap lets the first admin be provisioned without a server or Cloud Function.
7. In Realtime Database → Rules, paste the completed `database.rules.json` and publish the rules. Until this is done, do not use the app with real data.
8. In Realtime Database → Data, create `/users/<ADMIN_UID>` with this initial profile (replace the UID and email):

   ```json
   {
     "uid": "ADMIN_UID",
     "email": "admin@example.com",
     "displayName": "Audit Administrator",
     "role": "Admin",
     "active": true
   }
   ```

   The profile UID must match the authenticated Google UID exactly. The UID written into the rules and initial profile is the bootstrap trust anchor; treat rules publishing and database administration as owner-only operations.

## Run locally

Serve the repository over HTTP because Firebase modules do not work from a `file://` URL. From the repository root, use any static web server, such as:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000` and ensure `localhost` is an authorized Firebase Auth domain.

## Host on Firebase Hosting (optional)

Firebase Hosting's Spark no-cost quota is sufficient for a small static app. Install/use the Firebase CLI locally, select the existing project, and initialize Hosting with the repository root as the public directory and single-page-app rewrites disabled. Then deploy Hosting and Database Rules only:

```sh
firebase use internal-audit-c5e0b
firebase deploy --only hosting,database
```

Do not run `firebase init functions`, enable billing, or deploy any paid product. You can instead publish the static files with GitHub Pages. Add the resulting host domain to Firebase Authentication's Authorized domains.

## Roles and access

- **Admin:** employee approval, role changes, activation/deactivation, client access assignment, and all management actions.
- **Manager:** create clients, engagements, and tasks; see team workload.
- **Senior / Auditor:** work on assigned tasks and update their status.
- **Read-only:** view workspace records without write actions.
- A first-time Google user can create only a pending, inactive profile. They cannot assign their own role or activate their account.
- Rules enforce active-user access, manager/admin writes to master data, task assignment and update permissions, valid record relationships, status values, and profile role validation.
- Active users can read the clients, engagements, and tasks collection in this implementation. Client assignment controls the records shown in the UI; Realtime Database's collection reads cannot filter records by a per-user map without a different indexed data model or server-side code. Do not treat the UI filter as a confidentiality boundary for client records.

## Data model

```text
/users/{uid}
  uid, email, displayName, role, active, clientAccess/{clientId}
/clients/{clientId}
  name, industry, status, createdBy, createdAt
/engagements/{engagementId}
  clientId, name, financialYear, status, leadId, createdBy, createdAt
/tasks/{taskId}
  clientId, engagementId, title, area, assignedTo, reviewer, dueDate,
  priority, status, progress, createdBy, createdAt, updatedAt
```

Employee onboarding is invite-by-process rather than email invitation: an employee signs in with Google once, then an Admin activates and assigns the pending profile. No separate invitation service or paid email service is used.

## Verification and deployment status

Local source/configuration checks can be run from the repository. No Firebase console changes, database creation, rule publication, authentication session test, or live deployment are performed by this repository build. Complete the console steps above, test with separate Admin and non-admin Google accounts, and verify the published rules before entering real client information.
