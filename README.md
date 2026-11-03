# AuditFlow

AuditFlow is a static internal audit workspace using Firebase Google Authentication and Realtime Database. It includes admin-controlled employee access, client and engagement registers, task assignment and status tracking, team workload, and CSV export.

## Free-service limits

- Keep Firebase project `internal-audit-c5e0b` on the **Spark (no-cost) plan**.
- This app uses Firebase Authentication and Realtime Database, with static files served by Firebase Hosting or another static host.
- Do not enable billing or use Cloud Functions, Firebase Storage, phone authentication, or paid services.
- `assets/js/config.js` contains public browser configuration. Realtime Database rules enforce access; the API key is not an authorization secret.

## One-time Firebase setup

1. In Firebase Console, confirm the project is on Spark.
2. In **Authentication → Sign-in method**, enable Google. In **Authentication → Settings → Authorized domains**, add the app's host and `localhost` for local work.
3. Create the Realtime Database at the URL in `assets/js/config.js` (`https://internal-audit-c5e0b-default-rtdb.firebaseio.com`).
4. Sign in once with the Google account that will own AuditFlow. In Authentication → Users, copy its UID.
5. Publish `database.rules.json` in Realtime Database → Rules. There is no permanent UID bypass in the rules.
6. In Realtime Database → Data, manually create `/users/<ADMIN_UID>` (replace UID and email):

   ```json
   {
     "uid": "ADMIN_UID",
     "email": "admin@example.com",
     "displayName": "Audit Administrator",
     "role": "Admin",
     "active": true
   }
   ```

   The UID and email must match the Google account exactly. Only a project owner using the Firebase console can establish the first administrator because no active Admin exists yet. Reload AuditFlow after adding the profile. Subsequent activation, deactivation, and role changes are enforced by the active Admin profile; the bootstrap account can be deactivated by another Admin.

## Employee access flow

1. An Admin opens **Admin → Authorise employee**, enters the employee's Google email, selects a role and permitted clients, and saves.
2. The employee signs in with that same verified Google account. The app checks the pre-authorised email list and creates only a disabled, unprivileged profile record for that UID.
3. In Admin → Employee access, the Admin selects **Apply authorisation**. This applies the role and client access already saved for that email and activates the account.
4. Admins can change roles and client access or deactivate an employee at any time. Deactivation blocks workspace access under the database rules.

The email list is readable only by an Admin or through a query for the signed-in, verified email. Its records can only be written by an Admin. The profile created by a first sign-in is always `pending` and inactive; the rules do not allow that user to activate it, assign a role, or change another profile. This separation is required because a static browser app cannot safely administer Firebase Auth users or protect an admin secret.

If an employee signs in before their email is authorised, they see a contact-admin message and no profile is created. Authorise the email, then have them try again. If an account was pre-authorised before sign-in, the Admin must apply the authorisation after its disabled profile appears.

## Roles and database access

- **Admin:** employee access, all client and engagement management, task management, team workload.
- **Manager:** client, engagement, and task management and team workload.
- **Senior / Auditor:** read assigned client scopes and update status/progress on tasks assigned to them.
- **Read-only:** view records within assigned client scopes.
- User activation and roles are controlled by an Admin. The bootstrap admin is provisioned manually by the project owner.
- Rules deny unauthenticated access, limit employee profile reads, enforce client-scoped reads for non-managers, validate task/client/engagement relationships, and restrict assigned-user task updates. Client-scoped collection reads must use the app's indexed `clientId` query; rules are enforced by Firebase and are not UI filters.

## Data model

```text
/users/{uid}
  uid, email, displayName, role, active, clientAccess/{clientId}
/authorisedEmails/{inviteId}
  email, role, clientAccess/{clientId}, createdBy, createdAt
/clients/{clientId}
  name, industry, status, createdBy, createdAt
/engagements/{engagementId}
  clientId, name, financialYear, status, leadId, createdBy, createdAt
/tasks/{taskId}
  clientId, engagementId, title, area, assignedTo, reviewer, dueDate,
  priority, status, progress, createdBy, createdAt, updatedAt
```

## Run locally

Serve the repository over HTTP (Firebase modules do not load from `file://`):

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. Confirm `localhost` is an authorized Authentication domain.

## Optional static hosting

Firebase Hosting is optional and can be used within its Spark no-cost limits. Configure the repository root as the public directory with no single-page-app rewrite, then deploy Hosting and Realtime Database rules only:

```sh
firebase use internal-audit-c5e0b
firebase deploy --only hosting,database
```

Do not initialize Functions or enable billing. GitHub Pages or another static host is also suitable; add its domain to Firebase Authentication's Authorized domains.

## Verification status

Local source checks do not establish that Firebase Console settings, deployed Rules, authorized domains, Google sign-in, or live Hosting are configured. Those require the owner to complete the console steps above. Before using real client data, verify with a separate Admin and non-admin account that profile activation, client scoping, task restrictions, and deactivation behave as intended.

