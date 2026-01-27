from fastapi import status, HTTPException

class ErrorBase(HTTPException):
    detail: str
    status_code: status

    def __init__(self):
        super().__init__(status_code=self.status_code, detail=self.detail)