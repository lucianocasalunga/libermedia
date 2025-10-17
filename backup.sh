#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/mnt/storage/backups/libermedia"
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker exec libermedia-db pg_dump -U libermedia libermedia > $BACKUP_DIR/db_$DATE.sql

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /mnt/storage/libermedia/uploads/

# Remove backups com +7 dias
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "✅ Backup $DATE concluído"
