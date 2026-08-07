import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from backup import BACKUPS_DIR, create_backup, list_backups
from security import require_recorder

router = APIRouter(prefix="/api/backups", tags=["backups"])


@router.get("")
def get_backups(user=Depends(require_recorder)):
    return list_backups()


@router.post("")
def trigger_backup(user=Depends(require_recorder)):
    filename = create_backup()
    return {"filename": filename}


@router.get("/{filename}/download")
def download_backup(filename: str, user=Depends(require_recorder)):
    safe_name = os.path.basename(filename)
    path = os.path.join(BACKUPS_DIR, safe_name)
    if not os.path.exists(path):
        raise HTTPException(404, "Backup not found")
    return FileResponse(path, media_type="application/zip", filename=safe_name)
