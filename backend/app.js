const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const os = require('os');
const cloudinary = require('cloudinary').v2;

const app = express();
const port = process.env.PORT || 3000;


cloudinary.config({
    cloud_name: 'dvwwgniuu', 
    api_key: '435637839125462', 
    api_secret: 'K2qlE68rsXKJPsjRlr0BSSnnJWE' 
});

// Paths para o Frontend
const BASE_DIR = __dirname;
const DB_PATH = path.join(BASE_DIR, '..', 'database', 'crazyLook.db');
const FRONTEND_PATH = path.join(BASE_DIR, '..', 'frontend');
const STATIC_PATH = path.join(FRONTEND_PATH, 'static');
const TEMPLATES_PATH = path.join(FRONTEND_PATH, 'templates');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(STATIC_PATH));

// Configuração do Multer (Salva na pasta temporária do sistema)
const upload = multer({ 
    dest: os.tmpdir(), // Salva temporariamente
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image')) {
            cb(null, true);
        } else {
            cb(new Error('Formato inválido! Envie apenas imagens.'), false);
        }
    },
    limits: { files: 4 }
});

// ==========================================
// BANCO DE DADOS E MIGRAÇÃO
// ==========================================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Atualiza a tabela existente para suportar o Cloudinary automaticamente
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, category TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS product_images (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, image_path TEXT, public_id TEXT, is_main INTEGER)`);
            db.run(`CREATE TABLE IF NOT EXISTS informations (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, instagram TEXT, adress TEXT)`);
            db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT)`);

            // Tenta adicionar a coluna public_id se ela não existir (ignora o erro se já existir)
            db.run("ALTER TABLE product_images ADD COLUMN public_id TEXT", (err) => {
                if (!err) console.log("Coluna 'public_id' adicionada para o Cloudinary.");
            });
        });
    }
});

// ==========================================
// API ROUTES
// ==========================================

// Save or Update Config
app.post('/api/config', (req, res) => {
    const { whatsapp, instagram, address } = req.body;
    db.get("SELECT id FROM informations LIMIT 1", [], (err, row) => {
        if (err) return res.status(500).json({ detail: "Erro no banco" });
        if (row) {
            db.run("UPDATE informations SET phone = ?, instagram = ?, adress = ? WHERE id = ?", [whatsapp, instagram, address, row.id], (err) => {
                if (err) return res.status(500).json({ detail: "Erro no banco" });
                res.json({ message: "Salvo" });
            });
        } else {
            db.run("INSERT INTO informations (phone, instagram, adress) VALUES (?, ?, ?)", [whatsapp, instagram, address], (err) => {
                if (err) return res.status(500).json({ detail: "Erro no banco" });
                res.json({ message: "Salvo" });
            });
        }
    });
});

// Get Config
app.get('/api/config', (req, res) => {
    db.get("SELECT phone, instagram, adress FROM informations LIMIT 1", [], (err, row) => {
        if (err) return res.status(500).json({});
        res.json(row ? { whatsapp: row.phone, instagram: row.instagram, address: row.adress } : {});
    });
});

// List Products
app.get('/api/products', (req, res) => {
    const sql = `
        SELECT p.id, p.name, p.price, p.category, i.image_path 
        FROM products p 
        LEFT JOIN product_images i ON p.id = i.product_id AND i.is_main = 1
        ORDER BY p.id DESC`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json([]);
        const items = rows.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            category: i.category,
            image: i.image_path || ""
        }));
        res.json(items);
    });
});

// Get Product Details
app.get('/api/products/:product_id', (req, res) => {
    const { product_id } = req.params;
    db.get("SELECT * FROM products WHERE id = ?", [product_id], (err, product) => {
        if (err) return res.status(500).json({ detail: "Erro no servidor" });
        if (!product) return res.status(404).json({ detail: "Produto não encontrado" });
        
        db.all("SELECT id, image_path, is_main, public_id FROM product_images WHERE product_id = ?", [product_id], (err, images) => {
            if (err) return res.status(500).json({ detail: "Erro no servidor" });
            res.json({
                id: product.id,
                name: product.name,
                price: product.price,
                category: product.category,
                images: images.map(img => ({
                    id: img.id,
                    path: img.image_path,
                    is_main: Boolean(img.is_main)
                }))
            });
        });
    });
});

// Middleware to handle product creation transaction
const createProductTransaction = (req, res, next) => {
    const { name, price, category } = req.body;
    db.run("INSERT INTO products (name, price, category) VALUES (?, ?, ?)", [name, price, category], function(err) {
        if (err) {
            if (req.files) req.files.forEach(file => fs.unlink(file.path, () => {}));
            return res.status(500).json({ detail: err.message });
        }
        req.productId = this.lastID; 
        next();
    });
};

// Create Product & Upload to Cloudinary
app.post('/api/products', upload.array('files', 4), createProductTransaction, async (req, res) => {
    const { main_image_index } = req.body;
    const pid = req.productId;

    if (!req.files || req.files.length === 0) {
        db.run("DELETE FROM products WHERE id = ?", [pid]); 
        return res.status(400).json({ detail: "Nenhuma imagem enviada" });
    }

    try {
        // Envia todas as fotos para o Cloudinary em paralelo
        const uploadPromises = req.files.map(file => {
            return cloudinary.uploader.upload(file.path, { folder: 'crazylook_products' })
                .then(result => {
                    fs.unlink(file.path, () => {}); // Apaga o temporário
                    return result;
                });
        });

        const uploadedImages = await Promise.all(uploadPromises);

        // Salva os links do Cloudinary no Banco de Dados
        const dbPromises = uploadedImages.map((imgData, idx) => {
            return new Promise((resolve, reject) => {
                const is_main = (idx == parseInt(main_image_index, 10)) ? 1 : 0;
                db.run("INSERT INTO product_images (product_id, image_path, public_id, is_main) VALUES (?, ?, ?, ?)",
                    [pid, imgData.secure_url, imgData.public_id, is_main], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
            });
        });

        await Promise.all(dbPromises);
        res.status(201).json({ message: "Produto criado com sucesso!" });

    } catch (err) {
        console.error(err);
        db.run("DELETE FROM products WHERE id = ?", [pid]);
        res.status(500).json({ detail: "Erro ao fazer upload para nuvem." });
    }
});

// Update Product Text Details
app.put('/api/products/:product_id', (req, res) => {
    const { product_id } = req.params;
    const none = multer().none();
    none(req, res, err => {
        if (err) return res.status(500).json({ detail: "Error parsing form data" });
        const { name, price, category } = req.body;
        db.run("UPDATE products SET name = ?, price = ?, category = ? WHERE id = ?", [name, price, category, product_id], function(err) {
            if (err) return res.status(500).json({ detail: err.message });
            res.json({ message: "Atualizado" });
        });
    });
});

// Add New Images to Existing Product
app.post('/api/products/:product_id/images', upload.array('files', 4), async (req, res) => {
    const product_id = req.params.product_id;

    if (!req.files || req.files.length === 0) {
        return res.status(400).send({ message: "Nenhum arquivo enviado" });
    }
    
    try {
        const uploadPromises = req.files.map(file => {
            return cloudinary.uploader.upload(file.path, { folder: 'crazylook_products' })
                .then(result => {
                    fs.unlink(file.path, () => {}); 
                    return result;
                });
        });

        const uploadedImages = await Promise.all(uploadPromises);

        const dbPromises = uploadedImages.map(imgData => {
            return new Promise((resolve, reject) => {
                db.run("INSERT INTO product_images (product_id, image_path, public_id, is_main) VALUES (?, ?, ?, 0)", 
                    [product_id, imgData.secure_url, imgData.public_id], (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
            });
        });

        await Promise.all(dbPromises);
        res.status(201).json({ message: "Imagens adicionadas" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ detail: "Erro ao subir novas imagens." });
    }
});

// Delete Product & Delete from Cloudinary
app.delete('/api/products/:product_id', (req, res) => {
    const { product_id } = req.params;
    
    db.all("SELECT public_id, image_path FROM product_images WHERE product_id = ?", [product_id], (err, rows) => {
        if (err) return res.status(500).json({ detail: err.message });
        
        // Deleta as fotos do Cloudinary ou do Local (caso sejam antigas)
        rows.forEach(row => {
            if (row.public_id) {
                cloudinary.uploader.destroy(row.public_id).catch(console.error);
            } else if (row.image_path && row.image_path.startsWith('/static')) {
                // Mantivemos a segurança para apagar imagens antigas salvas localmente
                const imagePath = path.join(BASE_DIR, '..', 'frontend', row.image_path.replace(/\\/g, '/'));
                fs.unlink(imagePath, () => {});
            }
        });

        db.serialize(() => {
            db.run("DELETE FROM product_images WHERE product_id = ?", [product_id]);
            db.run("DELETE FROM products WHERE id = ?", [product_id], function(err) {
                if (err) return res.status(500).json({ detail: err.message });
                res.json({ message: "Deletado" });
            });
        });
    });
});

// Delete a Single Image
app.delete('/api/images/:image_id', (req, res) => {
    const { image_id } = req.params;
    db.get("SELECT public_id, image_path FROM product_images WHERE id = ?", [image_id], (err, row) => {
        if (err) return res.status(500).json({ detail: err.message });
        
        if (row) {
            if (row.public_id) {
                cloudinary.uploader.destroy(row.public_id).catch(console.error);
            } else if (row.image_path && row.image_path.startsWith('/static')) {
                const imagePath = path.join(BASE_DIR, '..', 'frontend', row.image_path.replace(/\\/g, '/'));
                fs.unlink(imagePath, () => {});
            }
        }
        
        db.run("DELETE FROM product_images WHERE id = ?", [image_id], function(err) {
            if (err) return res.status(500).json({ detail: err.message });
            res.json({ message: "Imagem removida" });
        });
    });
});

// Set Image as Main
app.post('/api/images/:image_id/main', (req, res) => {
    const { image_id } = req.params;
    db.get("SELECT product_id FROM product_images WHERE id = ?", [image_id], (err, row) => {
        if (err || !row) return res.status(404).json({ detail: "Imagem não encontrada" });
        
        const pid = row.product_id;
        db.serialize(() => {
            db.run("UPDATE product_images SET is_main = 0 WHERE product_id = ?", [pid]);
            db.run("UPDATE product_images SET is_main = 1 WHERE id = ?", [image_id], (err) => {
                 if (err) return res.status(500).json({ detail: err.message });
                 res.json({ message: "Capa atualizada" });
            });
        });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT password FROM users WHERE username = ?", [username], (err, row) => {
        if (err) return res.status(500).json({ detail: "Erro no servidor" });
        if (row && row.password === password) {
            res.json({ redirect: "/admin" });
        } else {
            res.status(401).json({ detail: "Erro login" });
        }
    });
});

// --- HTML Serving Routes ---
const servePage = (pageName) => (req, res) => {
    res.sendFile(path.join(TEMPLATES_PATH, pageName));
};

app.get('/', servePage('index.html'));
app.get('/login', servePage('login.html'));
app.get('/admin', servePage('admin.html'));
app.get('/produtos', servePage('produtos.html'));

// Start server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

process.on('SIGINT', () => {
    db.close(() => {
        console.log('Closed the database connection.');
        process.exit(0);
    });
});