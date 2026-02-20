import { db } from "./firebase-config.js";
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');
const inputBusca = document.getElementById('busca-leads');

const urlParams = new URLSearchParams(window.location.search);
const buscaDaUrl = urlParams.get('busca');

if (buscaDaUrl && inputBusca) {
    inputBusca.value = buscaDaUrl;
}

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

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nomeLead = document.getElementById('nome-lead').value;
    const telefone = document.getElementById('telefone-lead').value;
    const fonte = document.getElementById('fonte-lead').value;
    const tipo = document.getElementById('tipo-lead').value; 
    const dataChegada = document.getElementById('data-chegada').value;
    const dataEntrega = document.getElementById('data-entrega').value;
    const observacao = document.getElementById('obs-lead').value; 
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
            observacao: observacao, 
            status: statusInicial,
            corretor_id: idCorretor,
            corretor_nome: nomeCorretor,
            timestamp: new Date().toISOString(),
            data_status: new Date().toISOString() 
        });
        
        // ==========================================
        // LÓGICA DA MENSAGEM DO WHATSAPP PADRÃO
        // ==========================================
        
        // Pega apenas o primeiro nome do corretor
        const primeiroNome = nomeCorretor.split(' ')[0];
        
        // Se a observação estiver vazia, coloca "Nenhuma"
        const textoObs = observacao.trim() !== '' ? observacao : "Nenhuma observação";
        
        // Monta a string do jeitinho que você pediu (usando crases ` ` para pular linha)
        const mensagem = `Oi, ${primeiroNome}! 🍋😎\nChegou uma OPORTUNIDADE pra você!\n\nCliente na pista, venda na mira 🎯\nAgora é contigo transformar lead em contrato! 💰🔥\n\nDados do lead:\nCliente: ${nomeLead}\nTel: ${telefone}\nObservações: ${textoObs}\n\nVai lá e arrebenta! 💥🍋🚀`;

        // Joga a mensagem dentro da caixa de texto do Modal
        document.getElementById('texto-mensagem-copiar').value = mensagem;

        // Mostra a janelinha
        const modalMsg = new bootstrap.Modal(document.getElementById('modal-mensagem-lead'));
        modalMsg.show();

        // ==========================================
        
        // Reseta o formulário por trás para o próximo cadastro
        form.reset();
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
        document.getElementById('status-lead').value = "Distribuído"; 
    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    }
});

function filtrarE_Renderizar() {
    if(!inputBusca) return; 
    
    const termoDeBusca = inputBusca.value.toLowerCase().trim(); 
    
    const leadsFiltrados = memoriaLeads.filter(lead => {
        const textoBusca = `${lead.cliente || ''} ${lead.corretor_nome || ''} ${lead.fonte || ''} ${lead.status || ''} ${lead.tipo || ''} ${lead.observacao || ''}`.toLowerCase();
        return textoBusca.includes(termoDeBusca);
    });

    renderizarTabela(leadsFiltrados);
}

const q = query(collection(db, "leads"), orderBy("timestamp", "desc")); 

onSnapshot(q, (snapshot) => {
    memoriaLeads = []; 
    snapshot.forEach(doc => {
        memoriaLeads.push({ id: doc.id, ...doc.data() });
    });
    
    filtrarE_Renderizar();
});

if(inputBusca) {
    inputBusca.addEventListener('input', filtrarE_Renderizar);
}

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

        let htmlObs = '';
        if (d.observacao && d.observacao.trim() !== '') {
            htmlObs = `<div class="small text-muted fst-italic text-truncate mt-1" style="max-width: 180px;" title="${d.observacao}">
                          📝 ${d.observacao}
                       </div>`;
        }

        html += `
            <tr>
                <td>${dataFormatada}</td>
                <td><span class="fw-bold text-uppercase">${d.corretor_nome.split(' ')[0]}</span></td>
                <td>
                    <div class="fw-bold text-truncate" style="max-width: 180px;" title="${d.cliente}">${d.cliente}</div>
                    <div class="small">
                        <span class="badge ${badgeTipo}">${(d.tipo || '').toUpperCase()}</span>
                        <span class="text-muted ms-1">${d.telefone || ''}</span>
                    </div>
                    ${htmlObs}
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

// ==========================================
// FUNÇÃO DE COPIAR TEXTO DO WHATSAPP
// ==========================================
window.copiarMensagemLead = () => {
    const textarea = document.getElementById('texto-mensagem-copiar');
    
    // Seleciona o texto dentro da caixa (importante para funcionar no celular)
    textarea.select();
    textarea.setSelectionRange(0, 99999); 
    
    // Usa a API nativa do navegador para jogar no Ctrl+C
    navigator.clipboard.writeText(textarea.value).then(() => {
        // Pega o botão e muda a cor/texto dele temporariamente para dar o aviso de sucesso!
        const btn = document.getElementById('btn-copiar-msg');
        const textoOriginal = btn.innerHTML;
        
        btn.innerHTML = "✅ Mensagem Copiada!";
        btn.classList.replace('btn-success', 'btn-dark'); // Fica preto pra destacar
        
        // Depois de 2 segundos, o botão volta ao normal
        setTimeout(() => {
            btn.innerHTML = textoOriginal;
            btn.classList.replace('btn-dark', 'btn-success');
        }, 2000);
    }).catch(err => {
        console.error('Erro ao copiar: ', err);
        alert("Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.");
    });
};
