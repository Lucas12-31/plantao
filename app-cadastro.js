import { db, auth } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// TRUQUE SÊNIOR: Cria um "App Secundário" invisível só para criar a conta do corretor
// sem derrubar o login da Gestão Mestre!
const appSecundario = initializeApp(auth.app.options, "AppCriadorDeContas");
const authSecundario = getAuth(appSecundario);

const form = document.getElementById('form-corretor');
const lista = document.getElementById('lista-corretores');

// ==========================================
// 1. CADASTRAR NOVO CORRETOR
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nome = document.getElementById('nome-corretor').value.trim();
    const telefone = document.getElementById('telefone-corretor').value.trim();
    const email = document.getElementById('email-corretor').value.trim();

    try {
        await addDoc(collection(db, "corretores"), {
            nome: nome,
            telefone: telefone,
            email: email, 
            producao_pme: 0,
            producao_pf: 0,
            saldo_pme: 0,
            saldo_pf: 0,
            data_cadastro: new Date().toISOString()
        });

        alert("✅ Corretor cadastrado com sucesso!");
        form.reset();
        
        const modalEl = document.getElementById('modal-cadastrar-corretor');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if(modal) modal.hide();

    } catch (error) {
        console.error("Erro ao cadastrar corretor:", error);
        alert("Erro ao cadastrar.");
    }
});

// ==========================================
// 2. LISTAR EQUIPE EM TEMPO REAL
// ==========================================
const q = query(collection(db, "corretores"), orderBy("nome", "asc"));

onSnapshot(q, (snapshot) => {
    let html = '';
    
    if (snapshot.empty) {
        lista.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">Nenhum corretor cadastrado.</td></tr>';
        return;
    }

    snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const dados = docSnap.data();
        const telefone = dados.telefone || '';
        const email = dados.email || '';
        
        const telBadge = telefone ? `<span class="fw-bold text-secondary">${telefone}</span>` : `<span class="badge bg-light text-muted border">Sem número</span>`;
        const emailBadge = email ? `<span class="text-muted small">${email}</span>` : `<span class="badge bg-light text-muted border">Sem e-mail</span>`;

        // NOVO: Se o corretor tiver e-mail preenchido, o botão de gerar acesso aparece!
        let btnAcesso = '';
        if (email) {
            btnAcesso = `<button onclick="gerarAcessoCorretor('${dados.nome}', '${email}')" class="btn btn-outline-info btn-sm me-1 fw-bold shadow-sm" title="Criar Login para o Corretor">🔑 Acesso</button>`;
        }

        html += `
            <tr>
                <td class="text-start ps-4 fw-bold text-uppercase text-dark">${dados.nome}</td>
                <td class="align-middle">${telBadge}</td>
                <td class="align-middle">${emailBadge}</td>
                <td class="align-middle">
                    ${btnAcesso}
                    <button onclick="abrirModalEditarCorretor('${id}', '${dados.nome}', '${telefone}', '${email}')" class="btn btn-outline-warning btn-sm me-1 fw-bold shadow-sm" title="Editar Corretor">✏️</button>
                    <button onclick="deletarCorretor('${id}')" class="btn btn-outline-danger btn-sm fw-bold shadow-sm" title="Excluir Corretor">🗑️</button>
                </td>
            </tr>
        `;
    });

    lista.innerHTML = html;
});

// ==========================================
// NOVO: 3. FUNÇÃO DE CRIAR ACESSO NO FIREBASE
// ==========================================
window.gerarAcessoCorretor = async (nome, emailCorretor) => {
    const senha = prompt(`🔑 Criar acesso para ${nome}\n\nO e-mail de login será: ${emailCorretor}\n\nDigite uma senha (mínimo 6 caracteres) que este corretor usará para entrar no sistema:`);

    if (!senha) return; // Se a pessoa cancelar
    if (senha.length < 6) return alert("⚠️ A senha precisa ter pelo menos 6 caracteres!");

    try {
        // Cria a conta do corretor direto nos servidores do Google
        await createUserWithEmailAndPassword(authSecundario, emailCorretor, senha);
        
        // Desloga o app secundário para garantir segurança
        await signOut(authSecundario);
        
        alert(`✅ Sucesso! O acesso foi criado.\n\nEnvie isto para o corretor:\nSite: (Link do seu sistema)\nE-mail: ${emailCorretor}\nSenha: ${senha}`);
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/email-already-in-use') {
            alert("⚠️ Este e-mail já tem um acesso criado no sistema! Se ele esqueceu a senha, precisaremos redefinir pelo Firebase.");
        } else {
            alert("Erro ao criar acesso. Verifique se o e-mail é válido.");
        }
    }
};

// ==========================================
// 4. EDITAR E EXCLUIR CORRETOR
// ==========================================
window.abrirModalEditarCorretor = (id, nome, telefone, email) => {
    document.getElementById('edit-id-corretor').value = id;
    document.getElementById('edit-nome-corretor').value = nome;
    document.getElementById('edit-telefone-corretor').value = telefone;
    document.getElementById('edit-email-corretor').value = email;

    const modal = new bootstrap.Modal(document.getElementById('modal-editar-corretor'));
    modal.show();
};

window.salvarEdicaoCorretor = async () => {
    const id = document.getElementById('edit-id-corretor').value;
    const novoNome = document.getElementById('edit-nome-corretor').value.trim();
    const novoTelefone = document.getElementById('edit-telefone-corretor').value.trim();
    const novoEmail = document.getElementById('edit-email-corretor').value.trim();

    if (!novoNome) return alert("O nome não pode ficar em branco.");

    try {
        await updateDoc(doc(db, "corretores", id), {
            nome: novoNome,
            telefone: novoTelefone,
            email: novoEmail
        });
        bootstrap.Modal.getInstance(document.getElementById('modal-editar-corretor')).hide();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    }
};

window.deletarCorretor = async (id) => {
    if(confirm("⚠️ ATENÇÃO: Deseja excluir este corretor?")) {
        try { await deleteDoc(doc(db, "corretores", id)); } 
        catch (error) { console.error(error); alert("Erro ao excluir."); }
    }
};
