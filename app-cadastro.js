import { db, auth } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const appSecundario = initializeApp(auth.app.options, "AppCriadorDeContas");
const authSecundario = getAuth(appSecundario);

const form = document.getElementById('form-corretor');
const lista = document.getElementById('lista-corretores');

// ==========================================
// FUNÇÕES UNIVERSAIS DE ALERTAS BONITOS
// ==========================================
window.mostrarAlerta = (titulo, mensagem) => {
    document.getElementById('modal-alerta-titulo').innerText = titulo;
    document.getElementById('modal-alerta-mensagem').innerHTML = mensagem;
    new bootstrap.Modal(document.getElementById('modal-alerta')).show();
};

window.mostrarConfirmacao = (titulo, mensagem, callbackSim, corBtn = 'btn-success', textoBtn = 'Confirmar') => {
    document.getElementById('modal-confirmacao-titulo').innerText = titulo;
    document.getElementById('modal-confirmacao-mensagem').innerHTML = mensagem;
    
    const btn = document.getElementById('btn-confirmar-acao');
    btn.className = `btn fw-bold px-4 shadow-sm ${corBtn}`;
    btn.innerText = textoBtn;
    
    const novoBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(novoBtn, btn);
    
    const modalConfirm = new bootstrap.Modal(document.getElementById('modal-confirmacao'));
    
    novoBtn.onclick = () => {
        modalConfirm.hide();
        callbackSim();
    };
    
    modalConfirm.show();
};

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
            ativo: true,
            participa_plantao: true,
            data_cadastro: new Date().toISOString()
        });

        window.mostrarAlerta("Cadastrado! ✅", "O corretor foi adicionado à equipe com sucesso!");
        form.reset();
        bootstrap.Modal.getInstance(document.getElementById('modal-cadastrar-corretor')).hide();
    } catch (error) {
        window.mostrarAlerta("Erro", "Falha ao cadastrar.");
    }
});

// ==========================================
// 2. LISTAGEM COM BOTÕES SEPARADOS
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
        
        const isAtivo = dados.ativo !== false;
        const participaPlantao = dados.participa_plantao !== false;

        let nomeDisplay = isAtivo ? dados.nome : `<span class="text-decoration-line-through text-muted">${dados.nome}</span> <span class="badge bg-secondary ms-1" style="font-size:0.6rem;">INATIVO</span>`;
        let classRow = isAtivo ? "" : "bg-light opacity-75";

        html += `
            <tr class="${classRow}">
                <td class="text-start ps-4 fw-bold text-uppercase text-dark">
                    ${nomeDisplay} 
                    ${participaPlantao ? '' : '<span class="badge bg-warning text-dark ms-1" style="font-size:0.6rem;">SUSPENSO PLANTÃO</span>'}
                </td>
                <td class="align-middle">${dados.telefone || '<span class="badge bg-light text-muted border">Sem número</span>'}</td>
                <td class="align-middle">${dados.email || '<span class="badge bg-light text-muted border">Sem e-mail</span>'}</td>
                <td class="align-middle text-nowrap">
                    ${dados.email && isAtivo ? `<button onclick="gerarAcessoCorretor('${dados.nome}', '${dados.email}')" class="btn btn-outline-info btn-sm me-1 fw-bold shadow-sm" title="Criar Login">🔑</button>` : ''}
                    <button onclick="abrirModalEditarCorretor('${id}', '${dados.nome}', '${dados.telefone || ''}', '${dados.email || ''}')" class="btn btn-outline-warning btn-sm me-1 fw-bold shadow-sm" title="Editar">✏️</button>
                    <button onclick="toggleAtivo('${id}', '${dados.nome}', ${isAtivo})" class="btn btn-outline-${isAtivo ? 'secondary' : 'success'} btn-sm me-1 fw-bold shadow-sm" title="${isAtivo ? 'Inativar' : 'Reativar'}">${isAtivo ? '⏸️' : '▶️'}</button>
                    <button onclick="togglePlantao('${id}', '${dados.nome}', ${participaPlantao})" class="btn btn-outline-${participaPlantao ? 'warning' : 'primary'} btn-sm me-1 fw-bold shadow-sm" title="Suspender/Permitir Plantão">${participaPlantao ? '⛔' : '✅'}</button>
                    <button onclick="deletarCorretor('${id}', '${dados.nome}')" class="btn btn-outline-danger btn-sm fw-bold shadow-sm" title="Excluir">🗑️</button>
                </td>
            </tr>
        `;
    });
    lista.innerHTML = html;
});

// ==========================================
// 3. FUNÇÕES DE AÇÃO
// ==========================================
window.toggleAtivo = async (id, nome, ativoAtual) => {
    window.mostrarConfirmacao("Status Equipe", `Deseja ${ativoAtual ? 'inativar' : 'reativar'} o corretor <b>${nome}</b>?`, async () => {
        await updateDoc(doc(db, "corretores", id), { ativo: !ativoAtual });
    }, ativoAtual ? 'btn-secondary' : 'btn-success', ativoAtual ? '⏸️ Inativar' : '▶️ Reativar');
};

window.togglePlantao = async (id, nome, participaAtual) => {
    window.mostrarConfirmacao("Status Plantão", `Deseja ${participaAtual ? 'suspender' : 'permitir'} o corretor <b>${nome}</b> nas escalas?`, async () => {
        await updateDoc(doc(db, "corretores", id), { participa_plantao: !participaAtual });
    }, participaAtual ? 'btn-warning' : 'btn-primary', participaAtual ? '⛔ Suspender' : '✅ Permitir');
};

window.gerarAcessoCorretor = async (nome, emailCorretor) => {
    let msg = `Digite a senha (mínimo 6 caracteres):<br><input type="password" id="input-senha-acesso" class="form-control mt-3 text-center fw-bold border-info" placeholder="******">`;
    window.mostrarConfirmacao("🔑 Criar Acesso", msg, async () => {
        const senha = document.getElementById('input-senha-acesso').value;
        if (!senha || senha.length < 6) return window.mostrarAlerta("Atenção", "Senha curta!");
        try {
            await createUserWithEmailAndPassword(authSecundario, emailCorretor, senha);
            await signOut(authSecundario);
            window.mostrarAlerta("Sucesso", "Acesso criado!");
        } catch (e) { window.mostrarAlerta("Erro", "Falha ao criar acesso."); }
    }, 'btn-info text-white', '🔑 Criar');
};

window.abrirModalEditarCorretor = (id, nome, tel, email) => {
    document.getElementById('edit-id-corretor').value = id;
    document.getElementById('edit-nome-corretor').value = nome;
    document.getElementById('edit-telefone-corretor').value = tel;
    document.getElementById('edit-email-corretor').value = email;
    new bootstrap.Modal(document.getElementById('modal-editar-corretor')).show();
};

window.salvarEdicaoCorretor = async () => {
    const id = document.getElementById('edit-id-corretor').value;
    await updateDoc(doc(db, "corretores", id), {
        nome: document.getElementById('edit-nome-corretor').value,
        telefone: document.getElementById('edit-telefone-corretor').value,
        email: document.getElementById('edit-email-corretor').value
    });
    bootstrap.Modal.getInstance(document.getElementById('modal-editar-corretor')).hide();
};

window.deletarCorretor = async (id, nome) => {
    window.mostrarConfirmacao("Excluir?", "Tem certeza?", async () => {
        await deleteDoc(doc(db, "corretores", id));
    }, 'btn-danger', '🗑️ Excluir');
};
