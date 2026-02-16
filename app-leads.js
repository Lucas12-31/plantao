import { db } from "./firebase-config.js";
import { collection, addDoc, getDocs, onSnapshot, query, orderBy, limit, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');

// MAPA DE STATUS E EMOJIS
const STATUS_OPCOES = [
    { valor: "Distribuído", label: "🔵 Distribuído" },
    { valor: "Em negociação", label: "🟡 Em negociação" },
    { valor: "Declinado", label: "🟠 Declinado" },
    { valor: "Retornar depois", label: "🟣 Retornar depois" },
    { valor: "Proposta Gerada", label: "🐬 Proposta Gerada" },
    { valor: "Finalizado", label: "✅ Finalizado" },
    { valor: "Lead Inválido", label: "🔴 Lead Inválido" }
];

// 1. CARREGAR DADOS
async function carregarCorretores() {
    onSnapshot(collection(db, "corretores"), (snapshot) => {
        let html = '<option value="">Selecione um corretor...</option>';
        snapshot.forEach(doc => {
            let d = doc.data();
            html += `<option value="${doc.id}">${d.nome}</option>`;
        });
        selectCorretor.innerHTML = html;
    });
}

async function carregarParceiros() {
    onSnapshot(collection(db, "parceiros"), (snapshot) => {
        let html = '<option value="">Selecione a fonte...</option>';
        if (snapshot.empty) {
            html += '<option value="Outros">Nenhum parceiro</option>';
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

carregarCorretores();
carregarParceiros();

// 2. SALVAR LEAD
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeLead = document.getElementById('nome-lead').value;
    const telefone = document.getElementById('telefone-lead').value;
    const fonte = document.getElementById('fonte-lead').value;
    const tipo = document.getElementById('tipo-lead').value; 
    const dataChegada = document.getElementById('data-chegada').value;
    const dataEntrega = document.getElementById('data-entrega').value;
    const statusInicial = document.getElementById('status-lead').value;
    
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
            status: statusInicial,
            corretor_id: idCorretor,
            corretor_nome: nomeCorretor,
            timestamp: new Date(),
            data_status: new Date().toISOString() // Salva a data inicial do status também
        });
        
        alert("Lead cadastrado!");
        form.reset();
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
        document.getElementById('status-lead').value = "Distribuído"; 
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    }
});

// 3. LISTAR E GERAR STATUS COLORIDO
const q = query(collection(db, "leads"), orderBy("timestamp", "desc"), limit(30)); 

onSnapshot(q, (snapshot) => {
    let html = '';
    
    if (snapshot.empty) {
        tabela.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum lead recente.</td></tr>';
        return;
    }
    
    snapshot.forEach(doc => {
        let d = doc.data();
        let id = doc.id;
        
        let dataFormatada = d.data_entrega.split('-').reverse().slice(0,2).join('/');
        let badgeTipo = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        // GERA O SELECT
        let selectStatus = `<select class="form-select form-select-sm border-secondary fw-bold" 
                              onchange="mudarStatus('${id}', this.value)" 
                              style="font-size: 0.85rem;">`;
        
        STATUS_OPCOES.forEach(opcao => {
            let isSelected = (d.status === opcao.valor) ? "selected" : "";
            selectStatus += `<option value="${opcao.valor}" ${isSelected}>${opcao.label}</option>`;
        });
        selectStatus += `</select>`;

        // AQUI ESTAVA O ERRO: A função window.mudarStatus estava aqui dentro. 
        // Eu removi e coloquei lá no final.

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td><span class="fw-bold">${d.corretor_nome.split(' ')[0]}</span></td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 140px;">${d.cliente}</div>
                    <div class="small">
                        <span class="badge ${badgeTipo}">${d.tipo.toUpperCase()}</span>
                        <span class="text-muted ms-1">${d.telefone || ''}</span>
                    </div>
                </td>
                <td><small>${d.fonte}</small></td>
                <td>${selectStatus}</td>
                <td>
                    <button onclick="deletarLead('${id}')" class="btn btn-sm btn-outline-danger" title="Excluir">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
});

// ========================================================
// FUNÇÕES GLOBAIS (FORA DO LOOP) - LUGAR CORRETO
// ========================================================

// 4. MUDAR STATUS (Com Timestamp para Notificações)
window.mudarStatus = async (id, novoStatus) => {
    try {
        const docRef = doc(db, "leads", id);
        
        // Atualiza Status e Data (data_status)
        await updateDoc(docRef, { 
            status: novoStatus,
            data_status: new Date().toISOString() 
        });

        console.log(`Sucesso: Lead ${id} mudou para ${novoStatus}`);

    } catch (error) {
        console.error("Erro ao atualizar status:", error);
        alert("Erro ao atualizar status. Verifique o console.");
    }
};

// 5. DELETAR
window.deletarLead = async (id) => {
    if(confirm("Excluir este lead permanentemente?")) {
        try {
            await deleteDoc(doc(db, "leads", id));
        } catch (error) {
            console.error(error);
            alert("Erro ao excluir.");
        }
    }
};
