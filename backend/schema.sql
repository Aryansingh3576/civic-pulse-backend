-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'citizen', -- citizen, admin, worker
    points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    department TEXT,
    sla_hours INTEGER DEFAULT 24,
    base_priority INTEGER DEFAULT 1
);

-- Issues Table
CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    category_id INTEGER REFERENCES categories(id),
    title TEXT,
    description TEXT,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo_url TEXT,
    status TEXT DEFAULT 'Submitted', -- Submitted, Assigned, In Progress, Resolved, Closed
    priority TEXT DEFAULT 'Medium', -- Low, Medium, High
    priority_score INTEGER DEFAULT 0,
    assigned_to INTEGER REFERENCES users(id),
    resolution_photo_url TEXT,
    resolution_type TEXT, -- Temporary, Permanent
    upvotes INTEGER DEFAULT 0,
    is_escalated INTEGER DEFAULT 0, -- Boolean 0/1
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Votes Table (for Upvoting issues)
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER REFERENCES issues(id),
    user_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(issue_id, user_id)
);

-- Sensitive Zones (e.g., Hospitals, Schools)
CREATE TABLE IF NOT EXISTS sensitive_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT, -- Hospital, School, Government Office
    latitude REAL,
    longitude REAL,
    radius_meters INTEGER DEFAULT 100
);

-- Seed Categories
INSERT INTO categories (name, department, sla_hours, base_priority) VALUES
('Pothole', 'Roads', 168, 5),
('Garbage', 'Sanitation', 24, 4),
('Street Light', 'Electricity', 48, 4),
('Water Leakage', 'Water Supply', 24, 6),
('Stray Animals', 'Animal Control', 48, 3)
ON CONFLICT(name) DO NOTHING;
-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'citizen', -- citizen, admin, worker
    points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    department TEXT,
    sla_hours INTEGER DEFAULT 24,
    base_priority INTEGER DEFAULT 1
);

-- Issues Table
CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    category_id INTEGER REFERENCES categories(id),
    title TEXT,
    description TEXT,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo_url TEXT,
    status TEXT DEFAULT 'Submitted', -- Submitted, Assigned, In Progress, Resolved, Closed
    priority TEXT DEFAULT 'Medium', -- Low, Medium, High
    priority_score INTEGER DEFAULT 0,
    assigned_to INTEGER REFERENCES users(id),
    resolution_photo_url TEXT,
    resolution_type TEXT, -- Temporary, Permanent
    upvotes INTEGER DEFAULT 0,
    is_escalated INTEGER DEFAULT 0, -- Boolean 0/1
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Votes Table (for Upvoting issues)
CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER REFERENCES issues(id),
    user_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(issue_id, user_id)
);

-- Sensitive Zones (e.g., Hospitals, Schools)
CREATE TABLE IF NOT EXISTS sensitive_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT, -- Hospital, School, Government Office
    latitude REAL,
    longitude REAL,
    radius_meters INTEGER DEFAULT 100
);

-- Seed Categories
INSERT INTO categories (name, department, sla_hours, base_priority) VALUES
('Pothole', 'Roads', 168, 5),
('Garbage', 'Sanitation', 24, 4),
('Street Light', 'Electricity', 48, 4),
('Water Leakage', 'Water Supply', 24, 6),
('Stray Animals', 'Animal Control', 48, 3)
ON CONFLICT(name) DO NOTHING;
