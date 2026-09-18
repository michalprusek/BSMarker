"""Gunicorn configuration for production."""

from typing import Any

# Server socket
bind = "0.0.0.0:8000"
backlog = 2048

# Worker processes
# Reduced from 6 to 3 (2026-04-09): 6 workers exceeded 2G container limit under load
# Server: 2 CPUs, container limit 3G. Formula: 2*CPU+1=5 but limited by memory.
workers = 3
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000
max_requests = 1000
max_requests_jitter = 50
timeout = 60
graceful_timeout = 30
keepalive = 2

# Worker lifecycle settings
preload_app = True

# Logging
accesslog = "-"  # stdout
errorlog = "-"  # stderr
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Process naming
proc_name = "bsmarker-api"

# Server mechanics
daemon = False
pidfile = "/tmp/bsmarker.pid"
user = None
group = None
tmp_upload_dir = None

# SSL (if needed)
# keyfile = "/path/to/keyfile"
# certfile = "/path/to/certfile"

# StatsD integration (optional)
# statsd_host = "localhost:8125"
# statsd_prefix = "bsmarker"


def when_ready(server: Any) -> None:
    server.log.info("Server is ready. Spawning workers")


def worker_int(worker: Any) -> None:
    worker.log.info("Worker received INT or QUIT signal")


def pre_fork(server: Any, worker: Any) -> None:
    server.log.info(f"Worker spawned (pid: {worker.pid})")


def pre_exec(server: Any) -> None:
    server.log.info("Forked child, re-executing.")


def on_exit(server: Any) -> None:
    server.log.info("Server is shutting down")
