#!/bin/bash

echo "🚀 Starting Bozor E-commerce Platform..."

# Kill any existing processes on ports 8000 and 5173 to avoid conflicts
echo "🧹 Cleaning up ports..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Start Backend
echo "⚙️ Starting Django Backend..."
cd backend
source venv/bin/activate
python manage.py migrate # Ensure database is up to date
python manage.py runserver &
BACKEND_PID=$!
cd ..

# Start Frontend
echo "🎨 Starting Vite Frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ Both servers are starting!"
echo "🌐 Frontend: http://localhost:5173"
echo "🛠️ Backend: http://localhost:8000"
echo "Press [CTRL+C] to stop both servers."

# Wait for user interrupt
trap "kill $BACKEND_PID $FRONTEND_PID; echo '🛑 Servers stopped.'" SIGINT
wait
