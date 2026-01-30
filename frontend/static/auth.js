async function checkLogin() {
    const userInp = document.getElementById('username').value;
    const passInp = document.getElementById('password').value;
    const btn = document.querySelector('button[type="submit"]');

    // Feedback visual
    const textoOriginal = btn.innerText;
    btn.innerText = "Verificando...";
    btn.disabled = true;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: userInp, password: passInp })
        });

        if (response.ok) {
            const data = await response.json();
            // Salva sessão no navegador
            sessionStorage.setItem('isLoggedIn', 'true');
            // Redireciona
            window.location.href = data.redirect;
        } else {
            alert("Acesso Negado: Usuário ou senha incorretos.");
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    } catch (error) {
        console.error("Erro:", error);
        alert("Erro ao conectar com o servidor.");
        btn.innerText = textoOriginal;
        btn.disabled = false;
    }
}

function logout() {
    sessionStorage.removeItem('isLoggedIn');
    window.location.href = '/login';
}