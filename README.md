# PrepAPig: AI-Powered Pig Growth Tracker with Vaccination Scheduling and Feed Consumption System #

## Team Members 
| Name     | Role               |
| -------- | ------------------ |
| Patal, Mark Angelo G. | Backend Developer |
| Isabella Grace M. Elola | Frontend Developer  |
| Maris N. De Lunas | Frontend Developer |

## Overview 

PrepAPig is a web-based livestock management system designed to assist pig farmers and caretakers in monitoring pig growth, tracking feed consumption, and managing vaccination schedules. The system utilizes Artificial Intelligence (AI) to analyze growth trends and provide predictive insights that support decision-making in pig farming operations.

The project aims to improve farm productivity by digitizing traditional record-keeping processes, reducing manual errors, and providing real-time access to important livestock information.

## Features 

Pig profile management
Growth tracking and monitoring
Feed consumption recording
Vaccination scheduling and reminders
AI-powered growth prediction
Analytics and reporting dashboard
User authentication and role-based access control
Historical record management

## Project Motivation 

Traditional pig farming often relies on manual record-keeping methods that can be time-consuming, prone to errors, and difficult to manage. PrepAPig was developed to provide an efficient digital solution that centralizes livestock records, automates monitoring tasks, and assists caretakers in making data-driven decisions.

## Problem Statement ##

### Pig farmers and caretakers frequently face challenges such as: 

Inaccurate or incomplete growth records
Difficulty monitoring feed consumption
Missed vaccination schedules
Lack of predictive tools for growth assessment
Time-consuming manual documentation

PrepAPig addresses these challenges by integrating growth tracking, feed monitoring, vaccination scheduling, and AI-based prediction into a single platform.


## Installation 
### Prerequisites 

### Before installing the system, ensure the following software is installed:

Node.js (v18 or later)
npm (Node Package Manager)
MongoDB or MySQL (depending on project configuration)
Git
Step 1: Clone the Repository
git clone https://github.com/your-username/prepapig.git
cd prepapig
Step 2: Install Dependencies
npm install
Step 3: Configure Environment Variables

Create a .env file in the root directory and add the required configuration:

PORT=3000
DB_URI=your_database_connection_string
JWT_SECRET=your_secret_key
Step 4: Start the Database

Ensure your database server is running before launching the application.

Step 5: Run the Application

Development Mode:

npm run dev

Production Mode:

npm start
Step 6: Access the Application

Open your browser and navigate to:

http://localhost:3000
github.com


## Usage

### Login

Launch the application.
Enter your username and password.
Access the dashboard after successful authentication.

### Managing Pig Records
Navigate to the Pig Management module.
Add, edit, or remove pig profiles.
Update weight and health information as needed.

### Recording Feed Consumption
Open the Feed Monitoring module.
Select a pig profile.
Enter feed consumption details.
Save the record.

### Scheduling Vaccinations

Open the Vaccination Management module.
Select a pig profile.
Set vaccination dates and vaccine information.
Receive reminders for upcoming schedules.

### Viewing AI Predictions
Access the Analytics Dashboard.
Select a pig profile.
Review AI-generated growth forecasts and recommendations.

### System Architecture

Frontend:
    HTML
    CSS
    JavaScript

Backend:
    Node.js
    Express.js

Database:
    MongoDB/MySQL

AI Module:
    Machine Learning-based Growth Prediction


## Database Schema

### users
| Field         | Data Type    | Constraints               | Description            |
| ------------- | ------------ | ------------------------- | ---------------------- |
| user_id       | INT          | PK, AUTO_INCREMENT        | Unique user identifier |
| full_name     | VARCHAR(100) | NOT NULL                  | Owner's full name      |
| email         | VARCHAR(100) | UNIQUE, NOT NULL          | User email address     |
| password_hash | VARCHAR(255) | NOT NULL                  | Encrypted password     |
| created_at    | TIMESTAMP    | DEFAULT CURRENT_TIMESTAMP | Account creation date  |

### pig_batches
| Field          | Data Type                         | Constraints               | Description             |
| -------------- | --------------------------------- | ------------------------- | ----------------------- |
| batch_id       | INT                               | PK, AUTO_INCREMENT        | Unique batch identifier |
| batch_code     | VARCHAR(50)                       | UNIQUE, NOT NULL          | Batch reference code    |
| pig_count      | INT                               | NOT NULL                  | Number of pigs in batch |
| arrival_date   | DATE                              | NOT NULL                  | Date pigs arrived       |
| initial_weight | DECIMAL(8,2)                      | NOT NULL                  | Initial average weight  |
| feed_type      | VARCHAR(100)                      | NOT NULL                  | Assigned feed type      |
| status         | ENUM('Active','Sold','Completed') | NOT NULL                  | Current batch status    |
| created_at     | TIMESTAMP                         | DEFAULT CURRENT_TIMESTAMP | Record creation date    |

### growth_records
| Field          | Data Type    | Constraints        | Description            |
| -------------- | ------------ | ------------------ | ---------------------- |
| growth_id      | INT          | PK, AUTO_INCREMENT | Unique growth record   |
| batch_id       | INT          | FK                 | References pig_batches |
| average_weight | DECIMAL(8,2) | NOT NULL           | Average batch weight   |
| record_date    | DATE         | NOT NULL           | Recording date         |
| remarks        | TEXT         | NULL               | Additional notes       |
| Column   | References            |
| -------- | --------------------- |
| batch_id | pig_batches(batch_id) |

### vaccination_records
| Field          | Data Type                             | Constraints        | Description               |
| -------------- | ------------------------------------- | ------------------ | ------------------------- |
| vaccination_id | INT                                   | PK, AUTO_INCREMENT | Unique vaccination record |
| batch_id       | INT                                   | FK                 | References pig_batches    |
| vaccine_name   | VARCHAR(100)                          | NOT NULL           | Vaccine administered      |
| scheduled_date | DATE                                  | NOT NULL           | Planned vaccination date  |
| completed_date | DATE                                  | NULL               | Actual vaccination date   |
| status         | ENUM('Pending','Completed','Overdue') | NOT NULL           | Vaccination status        |
| Column   | References            |
| -------- | --------------------- |
| batch_id | pig_batches(batch_id) |

### expenses
| Field        | Data Type                                           | Constraints        | Description            |
| ------------ | --------------------------------------------------- | ------------------ | ---------------------- |
| expense_id   | INT                                                 | PK, AUTO_INCREMENT | Unique expense record  |
| batch_id     | INT                                                 | FK                 | References pig_batches |
| category     | ENUM('Feed','Vaccine','Piglet','Utilities','Other') | NOT NULL           | Expense category       |
| amount       | DECIMAL(10,2)                                       | NOT NULL           | Expense value          |
| description  | TEXT                                                | NULL               | Expense details        |
| expense_date | DATE                                                | NOT NULL           | Date expense occurred  |
| Column   | References            |
| -------- | --------------------- |
| batch_id | pig_batches(batch_id) |

### notifications
| Field             | Data Type                     | Constraints               | Description                |
| ----------------- | ----------------------------- | ------------------------- | -------------------------- |
| notification_id   | INT                           | PK, AUTO_INCREMENT        | Unique notification        |
| batch_id          | INT                           | FK                        | References pig_batches     |
| notification_type | VARCHAR(100)                  | NOT NULL                  | Reminder or alert type     |
| message           | TEXT                          | NOT NULL                  | Notification content       |
| status            | ENUM('Pending','Sent','Read') | NOT NULL                  | Notification state         |
| created_at        | TIMESTAMP                     | DEFAULT CURRENT_TIMESTAMP | Notification creation date |
| Column   | References            |
| -------- | --------------------- |
| batch_id | pig_batches(batch_id) |

### reports
| Field          | Data Type    | Constraints        | Description              |
| -------------- | ------------ | ------------------ | ------------------------ |
| report_id      | INT          | PK, AUTO_INCREMENT | Unique report identifier |
| report_type    | VARCHAR(100) | NOT NULL           | Report category          |
| generated_date | DATETIME     | NOT NULL           | Date generated           |
| file_path      | VARCHAR(255) | NOT NULL           | Report storage location  |

## Database Entity Relationship ##
| Parent Table | Relationship | Child Table                                   |
| ------------ | ------------ | --------------------------------------------- |
| pig_batches  | 1 : Many     | growth_records                                |
| pig_batches  | 1 : Many     | feed_records                                  |
| pig_batches  | 1 : Many     | vaccination_records                           |
| pig_batches  | 1 : Many     | expenses                                      |
| pig_batches  | 1 : Many     | notifications                                 |
| users        | 1 : Many     | pig_batches (optional ownership relationship) |

## Development Roadmap
### Sprint 1
Project setup
Authentication
Database creation
### Sprint 2
Pig batch management
Growth monitoring
### Sprint 3
Feed and vaccination modules
### Sprint 4
Expense tracking
Reports
### Sprint 5
Analytics
Notifications
### Sprint 6
Offline support
Deployment


| Method | Endpoint          | Description                  |
| ------ | ----------------- | ---------------------------- |
| POST   | /api/auth/login   | User login                   |
| GET    | /api/batches      | Retrieve batches             |
| POST   | /api/batches      | Create batch                 |
| GET    | /api/feed         | Retrieve feed records        |
| POST   | /api/feed         | Create feed record           |
| GET    | /api/vaccinations | Retrieve vaccination records |
| POST   | /api/vaccinations | Create vaccination record    |
| GET    | /api/expenses     | Retrieve expenses            |
| POST   | /api/expenses     | Create expense record        |

