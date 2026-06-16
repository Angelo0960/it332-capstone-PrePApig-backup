# it332-capstone-PrePApig

Integration Audit — PrepAPig: An AI-Powered Pig Growth Tracker with Vaccination Scheduling and Feed Consumption System
1. Does your system need to talk to other systems?

Yes.

Firebase Cloud Messaging (FCM)

Purpose: Sends vaccination reminders, feeding reminders, and overdue alerts to the farm owner.

Data exchanged:

Outgoing: reminder messages, notification content
Incoming: notification delivery status

Frequency:

Daily and whenever a scheduled event is due
Cloud Hosting Platform (Vercel)

Purpose: Hosts the PrepAPig web application and makes it accessible through the internet.

Data exchanged:

User requests
Dashboard data
System responses

Frequency:

Every time the owner accesses the system
2. Does your system need external data?

Yes, but only limited external data.

Firebase Cloud Messaging

Purpose: Provides push notification services.

External Data Received:

Notification delivery status
Device registration tokens

Frequency:

Whenever reminders are sent
No Weather, Maps, or Government Data

PrepAPig primarily relies on farm-generated data entered by the owner and does not require external weather services, mapping services, or government livestock databases.

3. Does your system need export/import?

Yes.

Report Export

Purpose: Allows the owner to generate and save farm reports.

Data Exported:

Growth Monitoring Reports
Feed Consumption Reports
Vaccination Reports
Expense Reports
Farm Analytics Reports

Format:

PDF

Frequency:

Whenever the owner requests a report
Database Synchronization

Purpose: Supports offline operation through PWA technology.

Data Imported/Synchronized:

Pig batch records
Feed records
Vaccination records
Expense records

Frequency:

Automatically when internet connectivity is restored
4. Does your system need automation?

Yes.

Automated Vaccination Reminders

Purpose: Notifies the owner about upcoming vaccination schedules.

Trigger:

Scheduled vaccination date

Frequency:

Automatic
Automated Feed Reminders

Purpose: Reminds the owner to update feed consumption records.

Trigger:

Scheduled feeding period

Frequency:

Automatic
Automated Overdue Alerts

Purpose: Warns the owner about missed vaccinations or overdue farm activities.

Trigger:

Missed schedules

Frequency:

Automatic
Automatic Offline Synchronization

Purpose: Synchronizes locally stored records to the cloud database after internet connectivity is restored.

Trigger:

Internet reconnection

Frequency:

Automatic