Civic Issue Reporting & Management System
Complete Implementation Plan
Technical Architecture Document
February 2026
Table of Contents

Executive Summary
This document provides a comprehensive implementation plan for a civic issue reporting and management web application featuring AI-powered categorization, photo validation, gamification, and real-time analytics.
Technology Stack: React + Vite (Frontend) | Python FastAPI (Backend) | PostgreSQL + Redis | TensorFlow/PyTorch (AI)
________________________________________
1. System Architecture
1.1 High-Level Architecture
The application follows a modern three-tier architecture:
•	Presentation Layer: React + Vite SPA with responsive design
•	Application Layer: Python FastAPI REST API with WebSocket support

•	Data Layer: PostgreSQL (primary) + Redis (caching) + S3 (media)
•	AI/ML Layer: TensorFlow/PyTorch models for categorization and validation
1.2 Component Interaction Flow
1.	User submits complaint via React frontend with photo and location
2.	FastAPI backend validates user (rate limiting) and extracts EXIF data
3.	AI model categorizes issue and validates photo authenticity
4.	System checks for duplicates using location + category clustering
5.	Complaint assigned to department with priority calculation
6.	Real-time notification sent via WebSocket to department dashboard
7.	Department resolves with photo proof → user earns points
8.	Auto-escalation if resolution exceeds SLA threshold
________________________________________
2. Technology Stack Details
2.1 Frontend Technologies
Technology	Purpose
React 18	UI framework with hooks and context API
Vite	Build tool - fast HMR, optimized builds
React Router v6	Client-side routing
TanStack Query	Data fetching, caching, synchronization
Zustand	Lightweight state management
Leaflet / Mapbox	Interactive maps, geolocation, heat maps
Recharts / Chart.js	Analytics dashboards, efficiency charts
Tailwind CSS	Utility-first CSS framework
Socket.io-client	Real-time updates for complaint status
2.2 Backend Technologies
Technology	Purpose
Python 3.11+	Core language with async support
FastAPI	Async web framework with auto-generated OpenAPI docs
PostgreSQL + PostGIS	Primary database with geospatial queries
SQLAlchemy 2.0+	ORM with async support
Redis	Caching, rate limiting, session storage
Celery	Background tasks (AI processing, notifications)
JWT + Passlib	Authentication & password hashing
Pillow + exif	Image processing and EXIF extraction
SpeechRecognition	Voice-to-text (Whisper API / Google STT)
TensorFlow/PyTorch	ML models for categorization
Socket.io	WebSocket server for real-time updates
________________________________________
3. Database Design
3.1 Core Tables
users
Stores citizen and department user accounts.
•	id (UUID, PK)
•	email (VARCHAR, unique)
•	password_hash (VARCHAR)
•	role (ENUM: citizen, department_officer, admin)
•	phone_number (VARCHAR)
•	gamification_points (INTEGER, default 0)
•	daily_complaint_count (INTEGER, default 0)
•	last_complaint_date (DATE)
•	created_at (TIMESTAMP)
•	is_active (BOOLEAN)
categories
Predefined issue categories for classification.
•	id (INTEGER, PK)
•	name (VARCHAR, e.g., ‘Road Damage’, ‘Sanitation’, ‘Streetlight’)
•	description (TEXT)
•	department_id (FK → departments)
•	sla_hours (INTEGER, service level agreement)
departments
Government departments responsible for issue resolution.
•	id (INTEGER, PK)
•	name (VARCHAR, e.g., ‘Public Works’, ‘Sanitation Department’)
•	email (VARCHAR)
•	phone (VARCHAR)
•	higher_authority_id (FK → departments, for escalation)
complaints
Core table for all civic issue reports.
•	id (UUID, PK)
•	user_id (FK → users)
•	category_id (FK → categories)
•	department_id (FK → departments)
•	title (VARCHAR)
•	description (TEXT)
•	voice_transcript (TEXT, nullable)
•	location (GEOGRAPHY, PostGIS point)
•	address (TEXT)
•	photo_url (VARCHAR)
•	photo_metadata (JSONB, EXIF data)
•	is_photo_authentic (BOOLEAN)
•	priority_score (FLOAT, calculated)
•	upvotes_count (INTEGER, default 0)
•	status (ENUM: submitted, in_progress, resolved, escalated, rejected)
•	resolution_photo_url (VARCHAR, nullable)
•	resolution_notes (TEXT, nullable)
•	submitted_at (TIMESTAMP)
•	resolved_at (TIMESTAMP, nullable)
•	escalated_at (TIMESTAMP, nullable)
•	duplicate_of (FK → complaints, nullable)
complaint_upvotes
Tracks community upvotes to prioritize issues.
•	id (INTEGER, PK)
•	complaint_id (FK → complaints)
•	user_id (FK → users)
•	created_at (TIMESTAMP)
•	UNIQUE(complaint_id, user_id)
complaint_history
Audit trail for complaint status changes.
•	id (INTEGER, PK)
•	complaint_id (FK → complaints)
•	old_status (VARCHAR)
•	new_status (VARCHAR)
•	changed_by (FK → users)
•	changed_at (TIMESTAMP)
gamification_transactions
Logs all point transactions for transparency.
•	id (INTEGER, PK)
•	user_id (FK → users)
•	complaint_id (FK → complaints)
•	points (INTEGER, +/-)
•	reason (VARCHAR, e.g., ‘Complaint Submitted’, ‘Issue Resolved’)
•	created_at (TIMESTAMP)
3.2 Indexes & Constraints
•	Geospatial index on complaints.location for area queries
•	Composite index on (user_id, submitted_at) for user history
•	Index on status + department_id for dashboard queries
•	Check constraint: daily_complaint_count ≤ 10
________________________________________
4. Feature Implementation Details
4.1 Auto-Categorization of Issues
Implementation Approach:
1.	Train multi-class text classification model using TensorFlow/PyTorch
2.	Dataset: Historical civic complaints labeled by category
3.	Model: DistilBERT fine-tuned for issue classification (high accuracy, efficient)
4.	Fallback: If confidence < 0.7, prompt user to select category manually
Technical Stack: - transformers library (Hugging Face) for DistilBERT - scikit-learn for TF-IDF baseline comparison - Model served via FastAPI endpoint: POST /api/classify-issue
Code Example:
from transformers import pipeline
classifier = pipeline('text-classification', model='distilbert-civic-issues')
result = classifier(complaint_text)
category = result[0]['label'] if result[0]['score'] > 0.7 else 'MANUAL_REVIEW'
4.2 High Issue Area - Red Zone
Implementation Approach:
1.	Use geospatial clustering to identify areas with high complaint density
2.	Calculate heat map using PostGIS ST_ClusterDBSCAN or HDBSCAN in Python
3.	Threshold: Areas with >10 unresolved complaints within 1 km radius = Red Zone
4.	Display on map view with color-coded intensity (green → yellow → red)
Technical Stack: - PostGIS extension for PostgreSQL (geospatial queries) - Leaflet.heat or Mapbox heatmap layer on frontend - Celery periodic task to recalculate zones every hour
4.3 Auto-Escalation to Higher Authority
Implementation Approach:
1.	Define SLA (Service Level Agreement) for each category in database
2.	Celery beat scheduler runs daily task to check overdue complaints
3.	If submitted_at + sla_hours < current_time AND status != ‘resolved’, escalate
4.	Reassign to department.higher_authority_id and send notification
Code Example:
@celery.task
def check_escalations():
    overdue = db.query(Complaint).filter(
        Complaint.status.in_(['submitted', 'in_progress']),
        func.now() - Complaint.submitted_at > Category.sla_hours
    ).all()
    for complaint in overdue:
        complaint.escalate_to_higher_authority()
4.4 Photo Proof for Problem Resolution
Implementation Approach:
1.	Require photo upload when department marks complaint as ‘resolved’
2.	Validate that resolution photo is taken at same location (±100m accuracy)
3.	Extract EXIF GPS data and compare with original complaint location
4.	Block resolution if photo is missing or location mismatch > threshold
Validation Rule: Haversine distance between original and resolution photo GPS < 100 meters
4.5 EXIF Photo Validation
Implementation Approach:
1.	Extract EXIF metadata using Pillow + exif library
2.	Validate GPS coordinates, capture timestamp, and camera model
3.	Check if photo timestamp is within last 24 hours (recent capture)
4.	Detect missing EXIF (possible internet download/screenshot) → flag for review
5.	Use reverse image search API (Google Vision API) to check if photo exists online
Code Example:
from exif import Image
with open(photo_path, 'rb') as img_file:
    img = Image(img_file)
    gps = img.get('gps_latitude'), img.get('gps_longitude')
    timestamp = img.get('datetime_original')
    if not gps or not timestamp:
        raise ValidationError('Photo missing EXIF data')
4.6 Complaint Limit - 10 Per Day
Implementation Approach:
1.	Store daily_complaint_count and last_complaint_date in users table
2.	Reset counter at midnight (Celery scheduled task)
3.	Before accepting complaint, check if count < 10 for today
4.	Return 429 Too Many Requests if limit exceeded
Alternative: Use Redis with sliding window rate limiting (more efficient)
4.7 Voice Input for Complaints
Implementation Approach:
1.	Frontend captures audio using Web Audio API (MediaRecorder)
2.	Send audio file to backend /api/voice-to-text endpoint
3.	Use OpenAI Whisper API or Google Speech-to-Text for transcription
4.	Store transcript in voice_transcript field, use for AI categorization
5.	Support multilingual transcription (Hindi, English, regional languages)
Technical Stack: - OpenAI Whisper API (99% accuracy, multilingual) - Alternative: Google Cloud Speech-to-Text (better for regional languages)
4.8 Gamification System
Point System: - +10 points for submitting a complaint - +50 points when issue is resolved - +5 points for upvoting a complaint - -20 points for spam/rejected complaints
Leaderboard: - Monthly leaderboard showing top contributors - Badges: Civic Hero (500 pts), Guardian (1000 pts), Champion (2500 pts) - Display user rank on profile page
4.9 Department Efficiency Metrics
Calculated Metrics: - Average Resolution Time = AVG(resolved_at - submitted_at) - Efficiency Score = (Resolved within SLA / Total Complaints) × 100 - Pending Complaints Count (grouped by status) - Monthly trend charts (resolved vs. submitted)
Implementation: Celery task aggregates metrics daily → cache in Redis → serve via /api/department/{id}/metrics
4.10 Map View & Analytics
Features: - Interactive map showing all complaints as markers (color-coded by status) - Heat map for high-density red zones - Filter by category, date range, status - Analytics charts: Bar chart (complaints by category), Line chart (monthly trends) - Department-specific view with their assigned area boundaries
4.11 Community Support - Upvote System
Implementation Approach:
1.	Before submitting, check for duplicates within 500m radius + same category
2.	Show existing complaints to user → allow upvote instead of duplicate
3.	Priority score increases with upvote count: priority = base_score + (upvotes × 5)
4.	One upvote per user per complaint (enforced by unique constraint)
Benefits: Reduces duplicate entries, surfaces high-impact issues, encourages community engagement
________________________________________
5. AI/ML Models Implementation
5.1 Issue Categorization Model
Model Architecture: - Base Model: DistilBERT (distilbert-base-uncased) - Fine-tuning: Add classification head for 10-15 civic categories - Training Data: ~5000 labeled civic complaints per category - Expected Accuracy: 85-92% (based on research benchmarks)
Training Code:
from transformers import AutoModelForSequenceClassification, Trainer
model = AutoModelForSequenceClassification.from_pretrained('distilbert-base-uncased', num_labels=15)
trainer = Trainer(model=model, train_dataset=train_data, eval_dataset=val_data)
trainer.train()
model.save_pretrained('./models/civic-categorizer')
5.2 Duplicate Detection Model
Approach: - Use Sentence-BERT for semantic similarity of complaint text - Combine with geospatial distance (PostGIS query for nearby complaints) - Threshold: cosine_similarity > 0.75 AND distance < 500m → potential duplicate
5.3 Photo Authenticity Detection
Multi-Layer Validation:
1.	EXIF Analysis: Check for GPS, timestamp, camera model consistency
2.	Reverse Image Search: Use Google Vision API to check online presence
3.	Manipulation Detection: Apply ELA (Error Level Analysis) to detect photoshopping
4.	Final Score: Weighted combination of all checks (0-100% authenticity score)
________________________________________
6. API Endpoints Design
6.1 Authentication Endpoints
•	POST /api/auth/register - User registration
•	POST /api/auth/login - User login (returns JWT)
•	GET /api/auth/me - Get current user profile
6.2 Complaint Endpoints
•	POST /api/complaints - Submit new complaint (with photo upload)
•	GET /api/complaints - List all complaints (with filters)
•	GET /api/complaints/{id} - Get complaint details
•	PATCH /api/complaints/{id}/status - Update complaint status (department only)
•	POST /api/complaints/{id}/upvote - Upvote a complaint
•	POST /api/complaints/{id}/resolve - Mark as resolved (with photo proof)
6.3 Utility Endpoints
•	POST /api/voice-to-text - Convert voice audio to text
•	POST /api/classify-issue - AI categorization of complaint text
•	GET /api/red-zones - Get high-issue areas
•	GET /api/analytics/department/{id} - Department performance metrics
•	GET /api/leaderboard - Top users by gamification points
________________________________________
7. Frontend Components Structure
7.1 Core Pages
•	HomePage.jsx - Landing page with map overview
•	SubmitComplaint.jsx - Form with photo/voice upload
•	ComplaintsList.jsx - Grid/List view with filters
•	ComplaintDetail.jsx - Full complaint details + upvote button
•	DepartmentDashboard.jsx - For department officers
•	Analytics.jsx - Charts and department metrics
•	Leaderboard.jsx - Gamification rankings
7.2 Reusable Components
•	Map.jsx - Interactive Leaflet map with markers + heatmap
•	VoiceRecorder.jsx - Audio capture component
•	PhotoUpload.jsx - Drag-drop image uploader with EXIF display
•	StatusBadge.jsx - Color-coded status indicator
•	ComplaintCard.jsx - Complaint preview card
________________________________________
8. Security & Authentication
8.1 Authentication Strategy
•	JWT (JSON Web Tokens) for stateless authentication
•	Access token expiry: 1 hour | Refresh token expiry: 7 days
•	Passwords hashed with bcrypt (cost factor 12)
8.2 Security Measures
•	Rate Limiting: 10 complaints/day per user, 100 API calls/minute
•	CORS: Whitelist only production domain
•	Input Validation: Pydantic models for all API inputs
•	File Upload: Max 5MB, allowed types: jpg/png only
•	SQL Injection Prevention: SQLAlchemy ORM (parameterized queries)
•	HTTPS enforced in production
________________________________________
9. Deployment Strategy
9.1 Infrastructure
•	Frontend: Vercel / Netlify (automatic deployments from GitHub)
•	Backend: AWS EC2 / DigitalOcean Droplet (Dockerized FastAPI)
•	Database: AWS RDS PostgreSQL / DigitalOcean Managed Database
•	Redis: AWS ElastiCache / DigitalOcean Managed Redis
•	Media Storage: AWS S3 / Cloudflare R2
•	ML Models: AWS SageMaker / Hugging Face Inference API
9.2 CI/CD Pipeline
1.	GitHub Actions for automated testing
2.	Docker containerization for backend
3.	Automated deployment on merge to main branch
4.	Database migrations using Alembic
________________________________________
10. Development Timeline
Phase	Tasks	Duration
Phase 1	Setup infrastructure, database design, basic authentication	Week 1-2
Phase 2	Complaint submission, photo upload, EXIF validation	Week 3-4
Phase 3	AI categorization model training & integration	Week 5-6
Phase 4	Department dashboard, resolution workflow, auto-escalation	Week 7-8
Phase 5	Voice input, gamification, upvote system	Week 9-10
Phase 6	Map view, analytics, red zone heatmap	Week 11-12
Phase 7	Testing, bug fixes, security audit	Week 13-14
Phase 8	Deployment, documentation, user training	Week 15-16
Total Estimated Timeline: 16 Weeks (4 Months)
________________________________________
Appendix: Key Code Examples
A. FastAPI Complaint Submission Endpoint
@app.post('/api/complaints')
async def submit_complaint(
    title: str,
    description: str,
    photo: UploadFile,
    location: dict,
    voice_file: Optional[UploadFile] = None,
    current_user: User = Depends(get_current_user)
):
    # Check rate limit
    if await check_daily_limit(current_user.id):
        raise HTTPException(429, 'Daily limit exceeded')
    
    # Upload photo to S3
    photo_url = await upload_to_s3(photo)
    
    # Extract EXIF
    exif_data = extract_exif(photo)
    is_authentic = validate_photo(exif_data)
    
    # Voice transcription
    transcript = await transcribe_voice(voice_file) if voice_file else None
    
    # AI categorization
    category = await classify_issue(description + (transcript or ''))
    
    # Check duplicates
    duplicates = await find_duplicates(location, category)
    if duplicates:
        return {'duplicate_found': True, 'existing_complaints': duplicates}
    
    # Create complaint
    complaint = await db.create_complaint({
        'user_id': current_user.id,
        'category_id': category.id,
        'department_id': category.department_id,
        'title': title,
        'description': description,
        'voice_transcript': transcript,
        'location': location,
        'photo_url': photo_url,
        'photo_metadata': exif_data,
        'is_photo_authentic': is_authentic
    })
    
    # Award points
    await award_points(current_user.id, 10, 'Complaint Submitted')
    
    return complaint
B. React Map Component with Heat Layer
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import HeatmapLayer from 'react-leaflet-heatmap-layer-v3';

function ComplaintMap({ complaints, redZones }) {
  return (
    <MapContainer center={[26.9124, 75.7873]} zoom={12}>
      <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
      
      {/* Complaint markers */}
      {complaints.map(c => (
        <Marker 
          key={c.id} 
          position={[c.latitude, c.longitude]}
          icon={getStatusIcon(c.status)}
        />
      ))}
      
      {/* Red zone heatmap */}
      <HeatmapLayer
        points={redZones}
        longitudeExtractor={m => m.lng}
        latitudeExtractor={m => m.lat}
        intensityExtractor={m => m.intensity}
        radius={25}
        blur={15}
        max={1.0}
      />
    </MapContainer>
  );
}
C. Voice Recording Component
import { useState } from 'react';

function VoiceRecorder({ onTranscript }) {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', blob);
      
      const res = await fetch('/api/voice-to-text', {
        method: 'POST',
        body: formData
      });
      const { transcript } = await res.json();
      onTranscript(transcript);
    };
    
    recorder.start();
    setMediaRecorder(recorder);
    setRecording(true);
  };
  
  const stopRecording = () => {
    mediaRecorder.stop();
    setRecording(false);
  };
  
  return (
    <button onClick={recording ? stopRecording : startRecording}>
      {recording ? 'Stop Recording' : 'Start Recording'}
    </button>
  );
}
________________________________________
Additional Resources
Recommended Libraries & Tools
Python Backend: - fastapi-users: Complete authentication system - fastapi-limiter: Advanced rate limiting - geopy: Geocoding and distance calculations - scikit-image: Image manipulation detection - googletrans: Multi-language support
React Frontend: - react-dropzone: File upload component - react-hot-toast: Toast notifications - framer-motion: Smooth animations - react-helmet: SEO meta tags - axios: HTTP client with interceptors
Performance Optimization
Backend: - Implement database query caching with Redis - Use connection pooling for PostgreSQL - Compress API responses with gzip - Lazy load ML models (load on first request)
Frontend: - Code splitting with React.lazy() - Image lazy loading with Intersection Observer - Virtualize large lists with react-window - Optimize bundle size with tree shaking
Monitoring & Analytics
•	Sentry: Error tracking and performance monitoring
•	Google Analytics: User behavior analytics
•	Prometheus + Grafana: Backend metrics dashboard
•	LogRocket: Session replay for debugging
________________________________________
Conclusion
This implementation plan provides a complete roadmap for building a modern civic issue reporting system. The architecture leverages AI/ML for automation, gamification for citizen engagement, and real-time analytics for transparency.
Key Success Factors: - Start with MVP (Phases 1-4) for quick deployment - Collect real user feedback early and iterate - Train AI models with actual civic complaint data from your region - Establish clear SLAs with government departments before launch - Build trust through transparency and consistent performance
Next Steps: 1. Set up development environment 2. Create database schema and seed data 3. Build authentication and basic complaint submission 4. Integrate AI models incrementally 5. Launch beta with limited user group 6. Scale based on feedback and usage patterns
