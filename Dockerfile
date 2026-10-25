# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Install system dependencies (needed for some python packages or selenium if used)
# We add chromium/chrome dependencies if you plan to use Selenium in headless mode later
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    musl-dev \
    chromium \
    chromium-driver \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on (Flask dashboard)
EXPOSE 5000

# Define environment variable
ENV PYTHONUNBUFFERED=1
ENV WEB_HOST=0.0.0.0

# Run the application
CMD ["python", "src/main.py"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:5000/ || exit 1
