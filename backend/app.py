import os
import sqlite3
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

# Pega o caminho absoluto da pasta onde o app.py está (pasta backend)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Define os caminhos subindo um nível (..) para achar o frontend
# Isso garante que ele ache C:\Users\PICHAU\Desktop\CrazyLookHaiti\frontend\...
STATIC_PATH = os.path.join(BASE_DIR, "..", "frontend", "static")
TEMPLATES_PATH = os.path.join(BASE_DIR, "..", "frontend", "templates")
DB_PATH = os.path.join(BASE_DIR, "..", "database", "crazyLook.db")

# Monta os arquivos estáticos (CSS, JS, Imagens)
app.mount("/static", StaticFiles(directory=STATIC_PATH), name="static")

# Configura os templates HTML
templates = Jinja2Templates(directory=TEMPLATES_PATH)

@app.get("/", response_class=HTMLResponse)
async def serve_home(request: Request):
    # O reload do Jinja2 acontece aqui
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def serve_login(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# ... outras rotas ...

if __name__ == "__main__":
    # IMPORTANTE: Use uvicorn.run desta forma para o reload funcionar
    # Ele vai monitorar mudanças nos arquivos e reiniciar o servidor sozinho
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)