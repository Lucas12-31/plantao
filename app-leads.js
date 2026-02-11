import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, onSnapshot, query, orderBy, limit, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');

// 1. CARREGAR CORRETORES
async function carregarCorretores() {
    // Usar onSnapshot aqui também garante que se cadastrar corretor novo, aparece na hora
    onSnapshot(collection(db, "corretores"), (snapshot) => {
        let html = '<option value="">Selecione um corretor...</option>';
        snapshot.forEach(doc => {
            let d = doc.data();
            html += `<option value="${doc.id}">${d.nome}</option>`;
        });
        selectCorretor.innerHTML = html;
    });
}

// 2. CARREGAR PARCEIROS
async function carregarParceiros() {
    onSnapshot(collection(db, "parceiros"), (snapshot) => {
        let html = '<option value="">Selecione a fonte...</option>';
        if (snapshot.empty) {
            html += '<option value="Outros">Nenhum parceiro cadastrado</option>';
        } else {
            snapshot.forEach(doc => {
                let d = doc.data();
                html += `<option value="${d.nome}">${d.nome}</option>`;
            });
            html += '<option value="Outros">Outros / Manual</option>';
        }
        selectFonte.innerHTML = html;
    });
}

// Inicializa
carregarCorretores();
carregarParceiros();

// 3. SALVAR LEAD
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeLead = document.getElementById('nome-lead').value;
    const telefone = document.getElementById('telefone-lead').value;
    const fonte = document.getElementById('fonte-lead').value;
    const tipo = document.getElementById('tipo-lead').value; 
    const dataChegada = document.getElementById('data-chegada').value;
    const dataEntrega = document.getElementById('data-entrega').value;
    
    const idCorretor = selectCorretor.value;
    const nomeCorretor = selectCorretor.options[selectCorretor.selectedIndex].text;

    try {
        await addDoc(collection(db, "leads"), {
            cliente: nomeLead,
            telefone: telefone,
            fonte: fonte,
            tipo: tipo,
            data_chegada: dataChegada,
            data_entrega: dataEntrega,
            corretor_id: idCorretor,
            corretor_nome: nomeCorretor,
            timestamp: new Date()
        });
        
        alert("Lead cadastrado com sucesso!");
        form.reset();
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar lead.");
    }
});

// 4. LISTAR LEADS COM BOTÃO EXCLUIR
const q = query(collection(db, "leads"), orderBy("timestamp", "desc"), limit(20)); // Aumentei para 20 últimos

onSnapshot(q, (snapshot) => {
    let html = '';
    
    if (snapshot.empty) {
        tabela.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum lead recente.</td></tr>';
        return;
    }

    snapshot.forEach(doc => {
        let d = doc.data();
        let id = doc.id;
        
        let dataFormatada = d.data_entrega.split('-').reverse().slice(0,2).join('/');
        let badge = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td>${d.corretor_nome}</td>
                <td><span class="badge ${badge}">${d.tipo.toUpperCase()}</span></td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 150px;">${d.cliente}</div>
                    <div class="text-muted small">Via: ${d.fonte}</div>
                </td>
                <td>
                    <button onclick="deletarLead('${id}')" class="btn btn-sm btn-outline-danger" title="Excluir Lead">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
});

// 5. FUNÇÃO PARA EXCLUIR LEAD
window.deletarLead = async (id) => {
    if(confirm("Tem certeza que deseja excluir este lead? Isso afetará a contagem do Plantão e Parceiros.")) {
        try {
            await deleteDoc(doc(db, "leads", id));
            // Não precisa de alert, a tabela atualiza sozinha
        } catch (error) {
            console.error("Erro ao excluir:", error);
            alert("Erro ao excluir lead.");
        }
    }
};
