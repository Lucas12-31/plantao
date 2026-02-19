import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');
const inputBusca = document.getElementById('busca-leads');

// Memória Global
let memoriaLeads = [];

const STATUS_OPCOES = [
    { valor: "Distribuído", label: "🔵 Distribuído" },
    { valor: "Em negociação", label: "🟡 Em negociação" },
    { valor: "Declinado", label: "🟠 Declinado" },
    { valor: "Retornar depois", label: "🟣 Retornar depois" },
    { valor: "Proposta Gerada", label: "🐬 Proposta Gerada" },
    { valor: "Finalizado", label: "✅ Finalizado" },
    { valor: "Lead Inválido", label: "🔴 Lead Inválido" }
];

// 1. CARREGAR SELECTS
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
        if (snapshot.empty) html += '<option value="Outros">Nenhum parceiro</option>';
        else {
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

// 2. SALVAR NOVO LEAD
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
            timestamp: new Date().toISOString(),
            data_status: new Date().toISOString() 
        });
        
        alert("Lead cadastrado com sucesso!");
        form.reset();
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
        document.getElementById('status-lead').value = "Distribuído"; 
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    }
});

// 3. SISTEMA DE BUSCA / FILTRO INTELIGENTE
function filtrarE_Renderizar() {
    if(!inputBusca) return; // Se o campo de busca não existir, ignora
    
    const termoDeBusca = inputBusca.value.toLowerCase().trim(); 
    
    // Filtra a memória de leads
    const leadsFiltrados = memoriaLeads.filter(lead => {
        // Junta todos os dados em um texto só, prevenindo erros se algo estiver vazio
        const textoBusca = `${lead.cliente || ''} ${lead.corretor_nome || ''} ${lead.fonte || ''} ${lead.status || ''} ${lead.tipo || ''}`.toLowerCase();
        return textoBusca.includes(termoDeBusca);
    });

    // Manda desenhar apenas os filtrados
    renderizarTabela(leadsFiltrados);
}

// 4. BUSCAR DADOS DO FIREBASE EM TEMPO REAL
const q = query(collection(db, "leads"), orderBy("timestamp", "desc")); 

onSnapshot(q, (snapshot) => {
    memoriaLeads = []; 
    snapshot.forEach(doc => {
        memoriaLeads.push({ id: doc.id, ...doc.data() });
    });
    
    // Assim que chegam novos dados do banco, ele aplica o filtro (se houver) e renderiza
    filtrarE_Renderizar();
});

// Aciona o filtro sempre que o usuário digitar algo
if(inputBusca) {
    inputBusca.addEventListener('input', filtrarE_Renderizar);
}

// 5. FUNÇÃO PARA DESENHAR A TABELA HTML
function renderizarTabela(listaDeLeads) {
    let html = '';
    
    if (listaDeLeads.length === 0) {
        tabela.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Nenhum lead encontrado.</td></tr>';
        return;
    }
    
    listaDeLeads.forEach(d => {
        let dataFormatada = "";
        if(d.data_entrega) {
            dataFormatada = d.data_entrega.split('-').reverse().slice(0,2).join('/');
        }
        
        let badgeTipo = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        let selectStatus = `<select class="form-select form-select-sm border-secondary fw-bold" 
                              onchange="mudarStatus('${d.id}', this.value)" 
                              style="font-size: 0.85rem;">`;
        
        STATUS_OPCOES.forEach(opcao => {
            let isSelected = (d.status === opcao.valor) ? "selected" : "";
            selectStatus += `<option value="${opcao.valor}" ${isSelected}>${opcao.label}</option>`;
        });
        selectStatus += `</select>`;

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td><span class="fw-bold text-uppercase">${d.corretor_nome.split(' ')[0]}</span></td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 140px;" title="${d.cliente}">${d.cliente}</div>
                    <div class="small">
                        <span class="badge ${badgeTipo}">${(d.tipo || '').toUpperCase()}</span>
                        <span class="text-muted ms-1">${d.telefone || ''}</span>
                    </div>
                </td>
                <td><small>${d.fonte}</small></td>
                <td>${selectStatus}</td>
                <td>
                    <button onclick="deletarLead('${d.id}')" class="btn btn-sm btn-outline-danger" title="Excluir">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
}

// ========================================================
// FUNÇÕES GLOBAIS
// ========================================================
window.mudarStatus = async (id, novoStatus) => {
    try {
        const docRef = doc(db, "leads", id);
        await updateDoc(docRef, { 
            status: novoStatus,
            data_status: new Date().toISOString() 
        });
        console.log(`Sucesso: Lead ${id} mudou para ${novoStatus}`);
    } catch (error) {
        console.error("Erro ao atualizar status:", error);
    }
};

window.deletarLead = async (id) => {
    if(confirm("Tem certeza que deseja excluir este lead permanentemente?")) {
        try {
            await deleteDoc(doc(db, "leads", id));
        } catch (error) {
            console.error(error);
            alert("Erro ao excluir.");
        }
    }
};
