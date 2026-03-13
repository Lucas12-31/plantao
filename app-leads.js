import { db } from "./firebase-config.js";
// NOVO: Adicionado o 'increment' na linha abaixo
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const selectCorretor = document.getElementById('select-corretor');
const selectFonte = document.getElementById('fonte-lead');
const form = document.getElementById('form-lead');
const tabela = document.getElementById('tabela-leads');
const inputBusca = document.getElementById('busca-leads');

const editSelectCorretor = document.getElementById('edit-select-corretor');
const editSelectFonte = document.getElementById('edit-fonte-lead');

const urlParams = new URLSearchParams(window.location.search);
const buscaDaUrl = urlParams.get('busca');

if (buscaDaUrl && inputBusca) {
    inputBusca.value = buscaDaUrl;
}

let memoriaLeads = [];
window.telefoneCorretorAtual = ""; 

const STATUS_OPCOES = [
    { valor: "Distribuído", label: "🔵 Distribuído" },
    { valor: "Em negociação", label: "🟡 Em negociação" },
    { valor: "Declinado", label: "🟠 Declinado" },
    { valor: "Retornar depois", label: "🟣 Retornar depois" },
    { valor: "Proposta Gerada", label: "🐬 Proposta Gerada" },
    { valor: "Finalizado", label: "✅ Finalizado" },
    { valor: "Lead Inválido", label: "🔴 Lead Inválido" }
];

// ==========================================
// CARREGAR DADOS INICIAIS
// ==========================================
async function carregarCorretores() {
    onSnapshot(collection(db, "corretores"), (snapshot) => {
        let html = '<option value="">Selecione um corretor...</option>';
        snapshot.forEach(doc => {
            let d = doc.data();
            let tel = d.telefone || '';
            html += `<option value="${doc.id}" data-telefone="${tel}">${d.nome}</option>`;
        });
        selectCorretor.innerHTML = html;
        if(editSelectCorretor) editSelectCorretor.innerHTML = html; 
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
        if(editSelectFonte) editSelectFonte.innerHTML = html; 
    });
}

carregarCorretores();
carregarParceiros();

// ==========================================
// SALVAR NOVO LEAD (INCREMENTA O CONTADOR)
// ==========================================
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
    
    const opCorretor = selectCorretor.options[selectCorretor.selectedIndex];
    const idCorretor = opCorretor.value;
    const nomeCorretor = opCorretor.text;
    const telefoneCorretor = opCorretor.getAttribute('data-telefone') || ''; 

    try {
        // 1. Salva o Lead na Base
        await addDoc(collection(db, "leads"), {
            cliente: nomeLead, telefone: telefone, fonte: fonte, tipo: tipo, data_chegada: dataChegada,
            data_entrega: dataEntrega, observacao: observacao, status: statusInicial,
            corretor_id: idCorretor, corretor_nome: nomeCorretor, corretor_telefone: telefoneCorretor, 
            timestamp: new Date().toISOString(), data_status: new Date().toISOString() 
        });
        
        // 2. MÁGICA: Incrementa +1 no contador de Leads Recebidos daquele corretor lá na Produção
        const corretorRef = doc(db, "corretores", idCorretor);
        const campoIncremento = (tipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
        await updateDoc(corretorRef, { [campoIncremento]: increment(1) });

        const primeiroNome = nomeCorretor.split(' ')[0];
        const textoObs = observacao.trim() !== '' ? observacao : "Nenhuma observação";
        const tipoFormatado = tipo.toUpperCase(); 
        
        const mensagem = `Oi, ${primeiroNome}! 🍋😎\nChegou uma OPORTUNIDADE pra você!\n\nCliente na pista, venda na mira 🎯\nAgora é contigo transformar lead em contrato! 💰🔥\n\n*Dados:*\n*Cliente:* ${nomeLead}\n*Tel:* ${telefone}\n*Tipo:* ${tipoFormatado}\n*Observações:* ${textoObs}\n\nVai lá e arrebenta! 💥🍋🚀`;

        document.getElementById('texto-mensagem-copiar').value = mensagem;
        window.telefoneCorretorAtual = telefoneCorretor;

        const modalNovoLeadEl = document.getElementById('modal-novo-lead');
        const modalNovoLead = bootstrap.Modal.getInstance(modalNovoLeadEl);
        if(modalNovoLead) modalNovoLead.hide();

        const modalMsg = bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-mensagem-lead'));
        modalMsg.show();

        form.reset();
        document.getElementById('data-chegada').valueAsDate = new Date();
        document.getElementById('data-entrega').valueAsDate = new Date();
        document.getElementById('status-lead').value = "Distribuído"; 
    } catch (error) { console.error(error); alert("Erro ao salvar."); }
});

// ==========================================
// RENDERIZAR TABELA
// ==========================================
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
    snapshot.forEach(doc => { memoriaLeads.push({ id: doc.id, ...doc.data() }); });
    filtrarE_Renderizar();
});

if(inputBusca) inputBusca.addEventListener('input', filtrarE_Renderizar);

function renderizarTabela(listaDeLeads) {
    let html = '';
    if (listaDeLeads.length === 0) {
        tabela.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Nenhum lead encontrado.</td></tr>'; return;
    }
    
    listaDeLeads.forEach(d => {
        let dataFormatada = d.data_entrega ? d.data_entrega.split('-').reverse().slice(0,2).join('/') : "";
        let badgeTipo = d.tipo === 'pme' ? 'bg-warning text-dark' : 'bg-info text-white';

        let selectStatus = `<select class="form-select form-select-sm border-secondary fw-bold mx-auto" onchange="mudarStatus('${d.id}', this.value)" style="font-size: 0.85rem; max-width: 200px;">`;
        STATUS_OPCOES.forEach(opcao => {
            let isSelected = (d.status === opcao.valor) ? "selected" : "";
            selectStatus += `<option value="${opcao.valor}" ${isSelected}>${opcao.label}</option>`;
        });
        selectStatus += `</select>`;

        let htmlObs = d.observacao && d.observacao.trim() !== '' ? `<div class="small text-muted fst-italic mt-1 text-start text-wrap" style="max-width: 250px;">📝 ${d.observacao}</div>` : '';

        html += `
            <tr>
                <td class="text-start ps-3 align-middle text-nowrap">${dataFormatada}</td>
                <td class="align-middle text-nowrap"><span class="fw-bold text-uppercase">${d.corretor_nome.split(' ')[0]}</span></td>
                <td class="text-start align-middle">
                    <div class="fw-bold text-wrap" style="min-width: 150px;">${d.cliente}</div>
                    <div class="small mt-1 d-flex align-items-center flex-wrap gap-1">
                        <span class="badge ${badgeTipo}">${(d.tipo || '').toUpperCase()}</span>
                        <span class="text-muted text-nowrap">${d.telefone || ''}</span>
                    </div>
                    ${htmlObs}
                </td>
                <td class="align-middle text-nowrap"><small>${d.fonte}</small></td>
                <td class="align-middle">${selectStatus}</td>
                <td class="align-middle">
                    <div class="d-flex flex-nowrap justify-content-center gap-1">
                        <button onclick="abrirMensagemLead('${d.id}')" class="btn btn-sm btn-outline-success p-1 px-2 shadow-sm" title="Mensagem">💬</button>
                        <button onclick="abrirModalEditarLead('${d.id}')" class="btn btn-sm btn-outline-warning p-1 px-2 shadow-sm" title="Editar">✏️</button>
                        <button onclick="deletarLead('${d.id}')" class="btn btn-sm btn-outline-danger p-1 px-2 shadow-sm" title="Excluir">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tabela.innerHTML = html;
}

// ==========================================
// FUNÇÕES DE AÇÕES DO LEAD E EDIÇÃO
// ==========================================
window.abrirMensagemLead = (idLead) => {
    const lead = memoriaLeads.find(l => l.id === idLead);
    if (!lead) return;
    const primeiroNome = (lead.corretor_nome || '').split(' ')[0];
    const nomeLead = lead.cliente || '';
    const telefone = lead.telefone || '';
    const textoObs = lead.observacao && lead.observacao.trim() !== '' ? lead.observacao : "Nenhuma observação";
    const tipoFormatado = (lead.tipo || '').toUpperCase();
    
    const mensagem = `Oi, ${primeiroNome}! 🍋😎\nChegou uma OPORTUNIDADE pra você!\n\nCliente na pista, venda na mira 🎯\nAgora é contigo transformar lead em contrato! 💰🔥\n\n*Dados:*\n*Cliente:* ${nomeLead}\n*Tel:* ${telefone}\n*Tipo:* ${tipoFormatado}\n*Observações:* ${textoObs}\n\nVai lá e arrebenta! 💥🍋🚀`;

    document.getElementById('texto-mensagem-copiar').value = mensagem;
    window.telefoneCorretorAtual = lead.corretor_telefone || '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-mensagem-lead')).show();
};

window.mudarStatus = async (id, novoStatus) => {
    try { await updateDoc(doc(db, "leads", id), { status: novoStatus, data_status: new Date().toISOString() }); } 
    catch (error) { console.error(error); }
};

// DELETAR (REDUZ O CONTADOR DO CORRETOR)
window.deletarLead = async (id) => {
    if(confirm("Deseja excluir este lead? O contador do corretor será atualizado.")) {
        try { 
            const lead = memoriaLeads.find(l => l.id === id);
            if(lead && lead.corretor_id) {
                const campo = (lead.tipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
                await updateDoc(doc(db, "corretores", lead.corretor_id), { [campo]: increment(-1) });
            }
            await deleteDoc(doc(db, "leads", id)); 
        } 
        catch (error) { console.error(error); }
    }
};

window.abrirModalEditarLead = (idLead) => {
    const lead = memoriaLeads.find(l => l.id === idLead);
    if (!lead) return;
    document.getElementById('edit-id-lead').value = lead.id;
    document.getElementById('edit-nome-lead').value = lead.cliente || '';
    document.getElementById('edit-telefone-lead').value = lead.telefone || '';
    document.getElementById('edit-tipo-lead').value = lead.tipo || 'pme';
    document.getElementById('edit-fonte-lead').value = lead.fonte || '';
    document.getElementById('edit-select-corretor').value = lead.corretor_id || '';
    document.getElementById('edit-obs-lead').value = lead.observacao || '';
    new bootstrap.Modal(document.getElementById('modal-editar-lead')).show();
};

// EDITAR (AJUSTA OS CONTADORES SE MUDAR DE CORRETOR OU DE TIPO DE LEAD)
window.salvarEdicaoLead = async () => {
    const idLead = document.getElementById('edit-id-lead').value;
    const novoNome = document.getElementById('edit-nome-lead').value.trim();
    const novoTelefone = document.getElementById('edit-telefone-lead').value.trim();
    const novoTipo = document.getElementById('edit-tipo-lead').value;
    const novaFonte = document.getElementById('edit-fonte-lead').value;
    const novaObs = document.getElementById('edit-obs-lead').value.trim();
    
    const comboCorretor = document.getElementById('edit-select-corretor');
    const novoIdCorretor = comboCorretor.value;
    const novoNomeCorretor = comboCorretor.options[comboCorretor.selectedIndex].text;
    const novoTelCorretor = comboCorretor.options[comboCorretor.selectedIndex].getAttribute('data-telefone') || '';

    if (!novoNome || !novoIdCorretor) return alert("Preencha o nome e o corretor.");

    try {
        const leadAntigo = memoriaLeads.find(l => l.id === idLead);
        
        // Verifica se mudou o dono do lead ou mudou de PF para PME (para arrumar os contadores)
        if (leadAntigo && (leadAntigo.corretor_id !== novoIdCorretor || leadAntigo.tipo !== novoTipo)) {
            // Tira -1 do contador antigo
            if (leadAntigo.corretor_id) {
                const campoAntigo = (leadAntigo.tipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
                await updateDoc(doc(db, "corretores", leadAntigo.corretor_id), { [campoAntigo]: increment(-1) });
            }
            // Adiciona +1 no contador novo
            const campoNovo = (novoTipo === 'pme') ? 'leads_recebidos_pme' : 'leads_recebidos_pf';
            await updateDoc(doc(db, "corretores", novoIdCorretor), { [campoNovo]: increment(1) });
        }

        // Salva as alterações na base de leads
        await updateDoc(doc(db, "leads", idLead), {
            cliente: novoNome, telefone: novoTelefone, tipo: novoTipo, fonte: novaFonte, observacao: novaObs,
            corretor_id: novoIdCorretor, corretor_nome: novoNomeCorretor, corretor_telefone: novoTelCorretor
        });

        bootstrap.Modal.getInstance(document.getElementById('modal-editar-lead')).hide();
    } catch (error) { console.error(error); alert("Erro ao editar."); }
};

window.copiarMensagemLead = () => {
    const textarea = document.getElementById('texto-mensagem-copiar');
    textarea.select();
    textarea.setSelectionRange(0, 99999); 
    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.getElementById('btn-copiar-msg');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = "✅ Copiado!";
        btn.classList.replace('btn-outline-success', 'btn-dark'); 
        setTimeout(() => { btn.innerHTML = textoOriginal; btn.classList.replace('btn-dark', 'btn-outline-success'); }, 2000);
    });
};

window.enviarWhatsAppLead = () => {
    const textarea = document.getElementById('texto-mensagem-copiar');
    let tel = window.telefoneCorretorAtual.replace(/\D/g, ''); 
    let url = (tel && tel.length >= 10) 
        ? `https://wa.me/${tel.startsWith('55') ? tel : '55'+tel}?text=${encodeURIComponent(textarea.value)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(textarea.value)}`;
    window.open(url, '_blank');
};
