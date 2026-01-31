import os
import sqlite3
import uuid
import shutil
from typing import List
from fastapi import FastAPI, Request, HTTPException, File, UploadFile, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn

app = FastAPI()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_PATH = os.path.join(BASE_DIR, "..", "frontend", "static")
TEMPLATES_PATH = os.path.join(BASE_DIR, "..", "frontend", "templates")
DB_PATH = os.path.join(BASE_DIR, "..", "database", "crazyLook.db")
IMAGES_DIR = os.path.join(STATIC_PATH, "product_images")
os.makedirs(IMAGES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_PATH), name="static")
templates = Jinja2Templates(directory=TEMPLATES_PATH)

class ConfigRequest(BaseModel):
    whatsapp: str
    instagram: str
    address: str 

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/config")
async def save_config(data: ConfigRequest):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM informations LIMIT 1")
        row = cursor.fetchone()
        if row:
            cursor.execute("UPDATE informations SET phone = ?, instagram = ?, adress = ? WHERE id = ?", 
                           (data.whatsapp, data.instagram, data.address, row[0]))
        else:
            cursor.execute("INSERT INTO informations (phone, instagram, adress) VALUES (?, ?, ?)", 
                           (data.whatsapp, data.instagram, data.address))
        conn.commit()
        conn.close()
        return {"message": "Salvo"}
    except Exception as e:
        print(e)
        raise HTTPException(500, detail="Erro no banco")

@app.get("/api/config")
async def get_config():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT phone, instagram, adress FROM informations LIMIT 1")
        row = cursor.fetchone()
        conn.close()
        return {"whatsapp": row[0], "instagram": row[1], "address": row[2]} if row else {}
    except:
        return {}

@app.get("/api/products")
async def list_products():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT p.id, p.name, p.price, p.category, i.image_path 
        FROM products p 
        LEFT JOIN product_images i ON p.id = i.product_id AND i.is_main = 1
        ORDER BY p.id DESC
    """)
    items = cursor.fetchall()
    conn.close()
    return [{
        "id": i["id"], 
        "name": i["name"], 
        "price": i["price"], 
        "category": i["category"], 
        "image": i["image_path"] or ""
    } for i in items]

@app.get("/api/products/{product_id}")
async def get_product_details(product_id: int):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM products WHERE id = ?", (product_id,))
    product = cursor.fetchone()
    if not product:
        conn.close()
        raise HTTPException(404, "Produto não encontrado")
    cursor.execute("SELECT id, image_path, is_main FROM product_images WHERE product_id = ?", (product_id,))
    images = cursor.fetchall()
    conn.close()
    return {
        "id": product["id"],
        "name": product["name"],
        "price": product["price"],
        "category": product["category"],
        "images": [{"id": img["id"], "path": img["image_path"], "is_main": bool(img["is_main"])} for img in images]
    }

@app.post("/api/products")
async def create_product(
    name: str = Form(...),
    price: float = Form(...),
    category: str = Form(...),
    main_image_index: int = Form(...),
    files: List[UploadFile] = File(...)
):
    if len(files) > 4: raise HTTPException(400, "Máximo 4 fotos")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO products (name, price, category) VALUES (?, ?, ?)", (name, price, category))
        pid = cursor.lastrowid
        for idx, file in enumerate(files):
            ext = file.filename.split(".")[-1]
            uname = f"prod_{pid}_{uuid.uuid4().hex}.{ext}"
            with open(os.path.join(IMAGES_DIR, uname), "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            is_main = 1 if idx == int(main_image_index) else 0
            cursor.execute("INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, ?)",
                           (pid, f"/static/product_images/{uname}", is_main))
        conn.commit()
        return {"message": "Criado"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()

@app.put("/api/products/{product_id}")
async def update_product(
    product_id: int,
    name: str = Form(...),
    price: float = Form(...),
    category: str = Form(...),
    files: List[UploadFile] = File(None) 
):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE products SET name = ?, price = ?, category = ? WHERE id = ?", (name, price, category, product_id))
        if files and files[0].filename:
            for file in files:
                ext = file.filename.split(".")[-1]
                uname = f"prod_{product_id}_{uuid.uuid4().hex}.{ext}"
                with open(os.path.join(IMAGES_DIR, uname), "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                cursor.execute("INSERT INTO product_images (product_id, image_path, is_main) VALUES (?, ?, 0)",
                               (product_id, f"/static/product_images/{uname}"))
        conn.commit()
        return {"message": "Atualizado"}
    except Exception as e:
        print(e)
        raise HTTPException(500, str(e))
    finally:
        conn.close()

@app.delete("/api/products/{product_id}")
async def delete_product(product_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT image_path FROM product_images WHERE product_id = ?", (product_id,))
        for (path,) in cursor.fetchall():
            try: os.remove(os.path.join(IMAGES_DIR, path.split("/")[-1]))
            except: pass
        cursor.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
        return {"message": "Deletado"}
    finally:
        conn.close()

@app.delete("/api/images/{image_id}")
async def delete_image_unit(image_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT image_path FROM product_images WHERE id = ?", (image_id,))
        row = cursor.fetchone()
        if row:
            try: os.remove(os.path.join(IMAGES_DIR, row[0].split("/")[-1]))
            except: pass
        cursor.execute("DELETE FROM product_images WHERE id = ?", (image_id,))
        conn.commit()
        return {"message": "Imagem removida"}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()

@app.post("/api/images/{image_id}/main")
async def set_image_main(image_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT product_id FROM product_images WHERE id = ?", (image_id,))
        row = cursor.fetchone()
        if not row: raise HTTPException(404, "Imagem não encontrada")
        pid = row[0]
        cursor.execute("UPDATE product_images SET is_main = 0 WHERE product_id = ?", (pid,))
        cursor.execute("UPDATE product_images SET is_main = 1 WHERE id = ?", (image_id,))
        conn.commit()
        return {"message": "Capa atualizada"}
    finally:
        conn.close()

@app.get("/", response_class=HTMLResponse)
async def serve_home(request: Request): return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def serve_login(request: Request): return templates.TemplateResponse("login.html", {"request": request})

@app.get("/admin", response_class=HTMLResponse)
async def serve_admin(request: Request): return templates.TemplateResponse("admin.html", {"request": request})

@app.get("/produtos", response_class=HTMLResponse)
async def serve_products(request: Request):
    return templates.TemplateResponse("produtos.html", {"request": request})

@app.post("/api/login")
async def login_api(data: LoginRequest):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT password FROM users WHERE username = ?", (data.username,))
    row = cursor.fetchone()
    conn.close()
    if row and row[0] == data.password: return {"redirect": "/admin"}
    raise HTTPException(401, "Erro login")
