from src.base_exception import ErrorBase
from fastapi import status

class UserAlreadyExist(ErrorBase):
    detail = "This user already exist"
    status_code = status.HTTP_400_BAD_REQUEST
