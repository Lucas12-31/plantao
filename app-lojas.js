import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, doc, setDoc, getDoc, query, orderBy, updateDoc, increment, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaFlamengo = document.getElementById('tabela-body-flamengo');
const tabelaTijuca = document.getElementById('tabela-body-tijuca');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');

let lojaAtual = 'flamengo'; 
let estado = { corretores: [], feriados: [], escala: { flamengo: {}, tijuca: {} }, diasDoMes: [], semanas: [] };
let carregamentoInicial = true;
window.lojaSorteioAtual = null; 
window.editandoPlantao = { loja: null, iso: null, turno: null, index: null, dataFmt: null };

// ==========================================
// PALETA DE CORES PARA OS CORRETORES (MAIS FORTES E VIBRANTES)
// ==========================================
const coresPastel = [
    '#b3e0ff', // Azul
    '#ffd6b3', // Pêssego
    '#b3ffb3', // Verde menta
    '#eeb3ff', // Lilás
    '#ffff99', // Amarelo
    '#ffb3d9', // Rosa
    '#b3ffff', // Ciano
    '#d9ffb3', // Verde lima
    '#b3b3ff', // Azul lavanda
    '#ffb3b3', // Salmão
    '#d9d9d9', // Cinza
    '#b3ffee', // Verde água
    '#ffe699', // Creme escuro
    '#d1b3ff', // Roxo
    '#ffcbb3'  // Damasco
];

// Função que gera sempre a mesma cor para o mesmo corretor baseado no ID dele
function getCorCorretor(id) {
    if (!id) return '';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return coresPastel[Math.abs(hash) % coresPastel.length];
}

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
    novoBtn.onclick = () => { modalConfirm.hide(); callbackSim(); };
    modalConfirm.show();
};

// ==========================================
// 1. INICIALIZAÇÃO E BUSCA
// ==========================================
window.iniciarLojas = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    const qFeriados = query(collection(db, "feriados"), orderBy("data", "asc"));
    onSnapshot(qFeriados, (snap) => {
        estado.feriados = [];
        snap.forEach(d => estado.feriados.push({ id: d.id, ...d.data() }));
        buscarEscalaNoBanco(); 
        if (document.getElementById('modal-feriados')?.classList.contains('show')) {
            renderizarListaFeriadosModal();
        }
    });

    onSnapshot(collection(db, "corretores"), (snap) => {
        estado.corretores = [];
        snap.forEach(d => {
            let dados = d.data();
            if (dados.ativo !== false && dados.participa_plantao !== false) {
                estado.corretores.push({ 
                    id: d.id, 
                    nome: dados.nome, 
                    pme: parseFloat(dados.producao_pme) || 0, 
                    pf: parseFloat(dados.producao_pf) || 0, 
                    faltas: parseInt(dados.faltas) || 0,
                    reposicoes: parseInt(dados.reposicoes) || 0
                });
            }
        });
        estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    });
    buscarEscalaNoBanco();
};

async function buscarEscalaNoBanco() {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    const ano = parseInt(anoStr);
    const mesIndex = parseInt(mesStr) - 1;

    const prev = new Date(ano, mesIndex - 1, 1);
    const next = new Date(ano, mesIndex + 1, 1);
    const formataMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const meses = [formataMes(prev), filtroMes.value, formataMes(next)];

    try {
        estado.escala.flamengo = {};
        estado.escala.tijuca = {};

        for (let m of meses) {
            let docF = await getDoc(doc(db, "escala_lojas", `flamengo_${m}`));
            if (docF.exists() && docF.data().escala) Object.assign(estado.escala.flamengo, docF.data().escala);

            let docT = await getDoc(doc(db, "escala_lojas", `tijuca_${m}`));
            if (docT.exists() && docT.data().escala) Object.assign(estado.escala.tijuca, docT.data().escala);
        }
        atualizarVisualizacao();
    } catch (error) { console.error("Erro ao buscar escala:", error); }
}

async function salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo) {
    let lotesPorMes = {};
    const escalaDaLoja = estado.escala[lojaAlvo];
    
    for (let iso in escalaDaLoja) {
        let mesDoIso = iso.substring(0, 7); 
        if(!lotesPorMes[mesDoIso]) lotesPorMes[mesDoIso] = {};
        lotesPorMes[mesDoIso][iso] = escalaDaLoja[iso];
    }

    const promessas = Object.keys(lotesPorMes).map(mesKey => {
        const docId = `${lojaAlvo}_${mesKey}`;
        return setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAlvo, mes: mesKey, escala: lotesPorMes[mesKey], atualizadoEm: new Date().toISOString()
        }, { merge: true }); 
    });
    await Promise.all(promessas);
}

// ==========================================
// 2. RENDERIZAR TABELAS E TRAVAS (CADEADO) E QUEBRA PÁGINA
// ==========================================
function atualizarVisualizacao() {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    estado.semanas = getSemanasFluidas(parseInt(anoStr), parseInt(mesStr) - 1, estado.feriados);

    const valorAntigoSemana = filtroSemana.value;
    filtroSemana.innerHTML = '<option value="all" class="fw-bold text-primary">📅 Exibir Mês Completo</option>';
    estado.semanas.forEach((sem, index) => {
        let dataInicio = sem[0].fmt;
        let dataFim = sem[sem.length - 1].fmt;
        filtroSemana.innerHTML += `<option value="${index}">Semana ${index + 1} (${dataInicio} a ${dataFim})</option>`;
    });

    if (carregamentoInicial) {
        filtroSemana.value = "all"; 
        carregamentoInicial = false;
    } else if (valorAntigoSemana) {
        filtroSemana.value = valorAntigoSemana;
    }

    const valSemana = filtroSemana.value;
    let diasDaVisao = (valSemana === "all") ? estado.semanas.flat() : (estado.semanas[parseInt(valSemana)] || []);

    const atualizarBotoesTrava = (lojaId) => {
        const btn = document.getElementById(`btn-lock-${lojaId}`);
        if (!btn) return;
        if (valSemana === "all") {
            btn.style.display = 'none'; 
        } else {
            btn.style.display = 'inline-block';
            let travadosCount = 0;
            const diasDestaSemana = estado.semanas[parseInt(valSemana)] || [];
            diasDestaSemana.forEach(d => {
                if (estado.escala[lojaId][d.iso] && estado.escala[lojaId][d.iso].travado) travadosCount++;
            });
            if (travadosCount > 0 && travadosCount >= (diasDestaSemana.length / 2)) {
                btn.innerHTML = '🔒 Destravar Semana';
                btn.className = 'btn btn-sm btn-secondary fw-bold shadow-sm';
            } else {
                btn.innerHTML = '🔓 Travar Semana';
                btn.className = 'btn btn-sm btn-warning text-dark fw-bold shadow-sm';
            }
        }
    };
    atualizarBotoesTrava('flamengo');
    atualizarBotoesTrava('tijuca');

    if (diasDaVisao.length === 0) {
        let msg = '<tr><td colspan="5" class="text-center py-4 text-muted">Não há dias úteis.</td></tr>';
        tabelaFlamengo.innerHTML = msg;
        tabelaTijuca.innerHTML = msg;
        return;
    }

    const desenharTabela = (lojaId) => {
        let htmlBody = '';
        const escalaDaLoja = estado.escala[lojaId];

        diasDaVisao.forEach((dia, index) => {
            let hojeISO = new Date().toISOString().split('T')[0];
            let classHoje = (dia.iso === hojeISO) ? "bg-warning" : "bg-white";
            let textoHoje = (dia.iso === hojeISO) ? '<br><span class="badge bg-danger mt-1">HOJE</span>' : '';
            let classFeriadoTd = dia.isFeriado ? "bg-danger text-white bg-opacity-75 border-danger" : classHoje;
            let classeMesDiferente = (dia.iso.substring(0,7) !== filtroMes.value) ? "fst-italic opacity-75" : "";
            let estiloBordaSexta = dia.diaSemana === 'Sexta' ? "border-bottom: 3px solid #343a40;" : "";
            
            // LÓGICA DE QUEBRA DE PÁGINA (SÓ PARA IMPRESSÃO DE MÊS COMPLETO)
            let ehSexta = dia.diaSemana === 'Sexta';
            let ehUltimoDia = index === diasDaVisao.length - 1;
            let classeQuebra = (ehSexta && !ehUltimoDia && valSemana === "all") ? "quebra-semana" : "";

            // Renderiza o Cadeadinho se o dia estiver travado
            let travado = escalaDaLoja[dia.iso] && escalaDaLoja[dia.iso].travado;
            let iconeTrava = travado ? '<br><span title="Semana Travada" style="font-size: 1.1rem; display: block; margin-top: 2px;">🔒</span>' : '';

            htmlBody += `<tr class="${classeMesDiferente} ${classeQuebra}" style="${estiloBordaSexta}">`;
            htmlBody += `
                <td class="${classFeriadoTd} border-end border-3 border-dark fw-bold text-center" style="vertical-align: middle;">
                    <div class="fs-5">${dia.diaSemana}</div>
                    <div class="${dia.isFeriado ? 'text-white' : 'text-muted'} small">${dia.fmt}</div>
                    ${textoHoje}${iconeTrava}
                </td>
            `;

            if (dia.isFeriado) {
                htmlBody += `<td colspan="4" class="bg-light align-middle text-center"><div class="alert alert-secondary mb-0 d-inline-block shadow-sm fw-bold px-3 py-1">🏖️ Folga: <span class="text-danger">${dia.descricaoFeriado}</span></div></td>`;
            } else {
                let escaladosHoje = escalaDaLoja[dia.iso] || { manha: [null, null], tarde: [null, null] };

                const desenharCadeira = (corretor, iso, turno, cadeiraIndex, dataFmt) => {
                    let conteudo = '';
                    let classesCard = 'card-vaga shadow-sm border-2'; 
                    let classesTexto = 'nome-corretor text-center w-100';
                    let badgeAtendimentos = '';
                    let iconeTroca = '';
                    let corFundo = ''; // Nova variável para a cor do corretor

                    if (corretor) {
                        if (corretor.falta) { 
                            classesCard += ' falta-bg'; 
                            classesTexto += ' falta-text'; 
                        } else {
                            // Aplica a cor suave gerada para o corretor se ele não faltou
                            corFundo = `background-color: ${getCorCorretor(corretor.id)};`;
                        }
                        
                        if (corretor.atendimentos > 0) badgeAtendimentos = `<span class="badge bg-success position-absolute top-0 start-100 translate-middle rounded-pill shadow" style="font-size: 0.8rem; z-index: 2;">${corretor.atendimentos}</span>`;
                        if (corretor.trocaInfo) { classesCard += ' border-warning border-2'; iconeTroca = '<span title="Plantão Trocado" class="me-1">🔄</span>'; }

                        let partesNome = corretor.nome.split(' ');
                        let primeiroNome = partesNome[0];
                        let sobrenome = '';
                        if (partesNome.length > 1) {
                            if (partesNome[1].toLowerCase().match(/^(da|de|do|dos|das)$/) && partesNome.length > 2) {
                                sobrenome = partesNome[1] + ' ' + partesNome[2];
                            } else {
                                sobrenome = partesNome[1];
                            }
                        }
                        let nomeExibicao = primeiroNome + (sobrenome ? '<br>' + sobrenome : '');

                        conteudo = `
                            <div class="${classesCard}" style="${corFundo}" onclick="abrirDetalhesPlantao('${lojaId}', '${iso}', '${turno}', ${cadeiraIndex}, '${dataFmt}')">
                                ${badgeAtendimentos}
                                <div class="${classesTexto}" title="${corretor.nome}">${iconeTroca}${nomeExibicao}</div>
                            </div>`;
                    } else {
                        conteudo = `
                            <div class="card-vaga border-2" style="border-style: dotted;" onclick="abrirDetalhesPlantao('${lojaId}', '${iso}', '${turno}', ${cadeiraIndex}, '${dataFmt}')">
                                <div class="text-muted fst-italic text-center w-100"><small>Vaga Livre</small></div>
                            </div>`;
                    }
                    return `<td class="align-middle p-2" style="width: 21%;">${conteudo}</td>`;
                };

                htmlBody += desenharCadeira(escaladosHoje.manha[0], dia.iso, 'manha', 0, dia.fmt); 
                htmlBody += desenharCadeira(escaladosHoje.manha[1], dia.iso, 'manha', 1, dia.fmt); 
                htmlBody += desenharCadeira(escaladosHoje.tarde[0], dia.iso, 'tarde', 0, dia.fmt); 
                htmlBody += desenharCadeira(escaladosHoje.tarde[1], dia.iso, 'tarde', 1, dia.fmt); 
            }
            htmlBody += `</tr>`;
        });
        return htmlBody;
    };

    tabelaFlamengo.innerHTML = desenharTabela('flamengo');
    tabelaTijuca.innerHTML = desenharTabela('tijuca');
}

// LÓGICA DE TRAVAR/DESTRAVAR SEMANA
window.toggleTravarSemana = async (lojaAlvo) => {
    const valSemana = filtroSemana.value;
    if (valSemana === "all") return; 
    
    const dias = estado.semanas[parseInt(valSemana)] || [];
    if (dias.length === 0) return;

    let travadosCount = 0;
    dias.forEach(d => {
        if (estado.escala[lojaAlvo][d.iso] && estado.escala[lojaAlvo][d.iso].travado) travadosCount++;
    });
    
    const vaiTravar = travadosCount < (dias.length / 2);

    dias.forEach(dia => {
        if (!estado.escala[lojaAlvo][dia.iso]) {
            estado.escala[lojaAlvo][dia.iso] = { manha: [null, null], tarde: [null, null] };
        }
        estado.escala[lojaAlvo][dia.iso].travado = vaiTravar;
    });

    try {
        await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
        atualizarVisualizacao();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Erro", "Falha ao travar/destravar a semana no banco de dados.");
    }
};

// ==========================================
// 3. GERENCIAMENTO E SALVAMENTO
// ==========================================
window.abrirDetalhesPlantao = (loja, iso, turno, index, dataFmt) => {
    window.editandoPlantao = { loja, iso, turno, index, dataFmt };
    let corretorAtual = null;
    if(estado.escala[loja][iso] && estado.escala[loja][iso][turno]) corretorAtual = estado.escala[loja][iso][turno][index];

    let nomeExibicao = corretorAtual ? corretorAtual.nome.split(' ')[0] : 'Vaga Livre';
    let turnoExibicao = turno === 'manha' ? 'Manhã' : 'Tarde';
    document.getElementById('modal-detalhes-titulo').innerText = `${nomeExibicao} - ${dataFmt} (${turnoExibicao})`;

    let selectHtml = '<option value="">-- Deixar Vaga Livre --</option>';
    estado.corretores.forEach(c => {
        let isSelected = (corretorAtual && corretorAtual.id === c.id) ? 'selected' : '';
        selectHtml += `<option value="${c.id}" data-nome="${c.nome}" ${isSelected}>${c.nome}</option>`;
    });
    document.getElementById('select-alterar-corretor').innerHTML = selectHtml;
    document.getElementById('input-atendimentos').value = corretorAtual && corretorAtual.atendimentos ? corretorAtual.atendimentos : 0;
    
    document.getElementById('check-falta').checked = corretorAtual && corretorAtual.falta === true;
    document.getElementById('check-reposicao').checked = corretorAtual && corretorAtual.reposicao === true; 

    const divTroca = document.getElementById('info-troca-container');
    const textoTroca = document.getElementById('texto-info-troca');
    if (corretorAtual && corretorAtual.trocaInfo) { textoTroca.innerHTML = corretorAtual.trocaInfo; divTroca.classList.remove('d-none'); } 
    else { textoTroca.innerHTML = ''; divTroca.classList.add('d-none'); }

    new bootstrap.Modal(document.getElementById('modal-detalhes-plantao')).show();
}

window.mudarAtendimentos = (valor) => {
    const input = document.getElementById('input-atendimentos');
    let atual = parseInt(input.value) || 0;
    atual += valor;
    if(atual < 0) atual = 0; 
    input.value = atual;
}

window.salvarDetalhesPlantao = async () => {
    const select = document.getElementById('select-alterar-corretor');
    const idSelecionado = select.value;
    const { loja, iso, turno, index } = window.editandoPlantao;
    
    if(!estado.escala[loja][iso]) estado.escala[loja][iso] = { manha: [null, null], tarde: [null, null], travado: false };
    
    let mantemTravado = estado.escala[loja][iso].travado || false;

    let corretorOriginal = estado.escala[loja][iso][turno][index];
    let infoTrocaExistente = corretorOriginal ? corretorOriginal.trocaInfo : null;
    let idAntigo = corretorOriginal ? corretorOriginal.id : null;
    
    let faltaAntiga = corretorOriginal ? (corretorOriginal.falta === true) : false;
    let reposicaoAntiga = corretorOriginal ? (corretorOriginal.reposicao === true) : false; 

    const faltaNova = document.getElementById('check-falta').checked;
    const reposicaoNova = document.getElementById('check-reposicao').checked; 

    try {
        if (idSelecionado) {
            if (idSelecionado === idAntigo) {
                let updates = {};
                if (faltaNova !== faltaAntiga) updates.faltas = increment(faltaNova ? 1 : -1);
                if (reposicaoNova !== reposicaoAntiga) updates.reposicoes = increment(reposicaoNova ? 1 : -1);
                if (Object.keys(updates).length > 0) await updateDoc(doc(db, "corretores", idSelecionado), updates);
            } else {
                if (idAntigo) {
                    let updatesAntigo = {};
                    if (faltaAntiga) updatesAntigo.faltas = increment(-1);
                    if (reposicaoAntiga) updatesAntigo.reposicoes = increment(-1);
                    if (Object.keys(updatesAntigo).length > 0) await updateDoc(doc(db, "corretores", idAntigo), updatesAntigo);
                }
                let updatesNovo = {};
                if (faltaNova) updatesNovo.faltas = increment(1);
                if (reposicaoNova) updatesNovo.reposicoes = increment(1);
                if (Object.keys(updatesNovo).length > 0) await updateDoc(doc(db, "corretores", idSelecionado), updatesNovo);
            }
        } else {
            if (idAntigo) {
                let updatesAntigo = {};
                if (faltaAntiga) updatesAntigo.faltas = increment(-1);
                if (reposicaoAntiga) updatesAntigo.reposicoes = increment(-1);
                if (Object.keys(updatesAntigo).length > 0) await updateDoc(doc(db, "corretores", idAntigo), updatesAntigo);
            }
        }

        if (idSelecionado) {
            const nomeSelecionado = select.options[select.selectedIndex].getAttribute('data-nome');
            const atendimentos = parseInt(document.getElementById('input-atendimentos').value) || 0;
            estado.escala[loja][iso][turno][index] = { id: idSelecionado, nome: nomeSelecionado, atendimentos: atendimentos, falta: faltaNova, reposicao: reposicaoNova };
            if (infoTrocaExistente && idSelecionado === idAntigo) estado.escala[loja][iso][turno][index].trocaInfo = infoTrocaExistente;
        } else {
            estado.escala[loja][iso][turno][index] = null;
        }
        
        estado.escala[loja][iso].travado = mantemTravado;
        await salvarEscalaNoBancoBaseadoNasDatas(loja);
        bootstrap.Modal.getInstance(document.getElementById('modal-detalhes-plantao')).hide();
        atualizarVisualizacao(); 
    } catch (error) { 
        console.error("Erro:", error); 
        mostrarAlerta("Erro de Sistema", "Ocorreu um erro ao salvar as alterações do plantão."); 
    }
}

// ==========================================
// 4. TROCA ENTRE PLANTÕES
// ==========================================
window.abrirModalTroca = () => {
    const valSemana = filtroSemana.value;
    const diasDaVisao = (valSemana === "all") ? estado.semanas.flat() : (estado.semanas[parseInt(valSemana)] || []);

    let options = '';
    let diasValidos = 0;
    diasDaVisao.forEach(d => {
        if(!d.isFeriado) { options += `<option value="${d.iso}">${d.fmt} - ${d.diaSemana}</option>`; diasValidos++; }
    });

    if (diasValidos === 0) return mostrarAlerta("Atenção", "Não há dias úteis visíveis para efetuar trocas.");
    document.getElementById('troca-data-1').innerHTML = options;
    document.getElementById('troca-data-2').innerHTML = options;
    new bootstrap.Modal(document.getElementById('modal-troca')).show();
};

window.efetuarTroca = async () => {
    const lojaAlvo = document.getElementById('troca-loja-selecao').value; 
    const d1 = document.getElementById('troca-data-1').value;
    const t1 = document.getElementById('troca-turno-1').value;
    const c1 = parseInt(document.getElementById('troca-cadeira-1').value);

    const d2 = document.getElementById('troca-data-2').value;
    const t2 = document.getElementById('troca-turno-2').value;
    const c2 = parseInt(document.getElementById('troca-cadeira-2').value);

    if (d1 === d2 && t1 === t2 && c1 === c2) return mostrarAlerta("Atenção", "Por favor, selecione cadeiras diferentes para trocar.");
    if (!estado.escala[lojaAlvo][d1] || !estado.escala[lojaAlvo][d2]) return mostrarAlerta("Erro", "Você não pode trocar cadeiras em dias sem escala gerada nesta loja.");

    let obj1 = estado.escala[lojaAlvo][d1][t1][c1];
    let obj2 = estado.escala[lojaAlvo][d2][t2][c2];

    let nome1 = obj1 ? obj1.nome.split(' ')[0] : "Vaga Livre";
    let nome2 = obj2 ? obj2.nome.split(' ')[0] : "Vaga Livre";

    const data1Fmt = d1.split('-').reverse().slice(0,2).join('/');
    const data2Fmt = d2.split('-').reverse().slice(0,2).join('/');
    const labelT1 = t1 === 'manha' ? 'Manhã' : 'Tarde';
    const labelT2 = t2 === 'manha' ? 'Manhã' : 'Tarde';

    let novoObj1 = obj2 ? { ...obj2 } : null;
    let novoObj2 = obj1 ? { ...obj1 } : null;

    if (novoObj1) novoObj1.trocaInfo = `🔄 Trocou com <b>${nome1}</b><br><small>(Original: ${data1Fmt} - ${labelT1})</small>`;
    if (novoObj2) novoObj2.trocaInfo = `🔄 Trocou com <b>${nome2}</b><br><small>(Original: ${data2Fmt} - ${labelT2})</small>`;

    estado.escala[lojaAlvo][d1][t1][c1] = novoObj1;
    estado.escala[lojaAlvo][d2][t2][c2] = novoObj2;

    try {
        await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
        mostrarAlerta("Troca Efetuada! 🔄", `<br><b>${nome1}</b> assumiu a cadeira de ${data2Fmt}.<br><b>${nome2}</b> assumiu a cadeira de ${data1Fmt}.`);
        bootstrap.Modal.getInstance(document.getElementById('modal-troca')).hide();
        atualizarVisualizacao();
    } catch (error) { 
        console.error("Erro:", error); 
        mostrarAlerta("Erro de Sistema", "Ocorreu um erro ao salvar a troca.");
    }
};

filtroMes.addEventListener('change', buscarEscalaNoBanco);
filtroSemana.addEventListener('change', atualizarVisualizacao);

// ==========================================
// 6. MODAL E SORTEIO INTELIGENTE
// ==========================================
window.zerarReposicoes = (id, nome) => {
    mostrarConfirmacao("Zerar Reposições", `O corretor <b>${nome}</b> já utilizou a reposição neste mês?<br><br>Deseja zerar o contador de Reposições Pendentes dele?`, async () => {
        try {
            await updateDoc(doc(db, "corretores", id), { reposicoes: 0 });
            mostrarAlerta("Tudo Certo ✨", `O contador de reposições de ${nome} foi zerado com sucesso!`);
        } catch (error) {
            console.error(error);
            mostrarAlerta("Erro", "Erro ao tentar zerar reposições.");
        }
    }, "btn-success", "✨ Sim, Zerar!");
};

window.abrirModalSorteio = (loja) => {
    window.lojaSorteioAtual = loja;
    document.getElementById('modal-sorteio-titulo').innerText = `Sorteio - Loja ${loja.charAt(0).toUpperCase() + loja.slice(1)}`;

    const divCheckboxes = document.getElementById('lista-checkboxes-corretores');
    let html = '';

    estado.corretores.forEach(c => {
        let isSuspenso = c.isSuspenso === true;
        let pme = isSuspenso ? 0 : (c.pme || 0);
        let pf = isSuspenso ? 0 : (c.pf || 0);
        let reposicoes = c.reposicoes || 0; 
        
        let corBorda = 'border-danger'; 
        let dataCor = 'vermelho';

        if (!isSuspenso && pme > 0) {
            corBorda = 'border-success'; 
            dataCor = 'verde';
        } else if (!isSuspenso && pf > 0) {
            corBorda = 'border-warning'; 
            dataCor = 'amarelo';
        }

        let pontos = (pme * 2) + pf;
        let totalPlantoes = pontos > 0 ? 1 + Math.floor(pontos / 5000) : 0;
        totalPlantoes = Math.min(4, totalPlantoes); 
        
        let totalSolo = Math.floor(pme / 5000);
        totalSolo = Math.min(2, totalSolo); 
        totalSolo = Math.min(totalSolo, totalPlantoes); 

        let infoDireito = '';
        if (isSuspenso) {
            infoDireito = `<span class="badge bg-dark text-white" style="font-size: 0.65rem;" title="Corretor Suspenso">⛔ SUSPENSO</span>`;
        } else {
            if (totalPlantoes > 0) {
                infoDireito = `<span class="badge bg-primary" style="font-size: 0.7rem;" title="Direito de Plantões no Mês">🏆 ${totalPlantoes} Vgs ${totalSolo > 0 ? `(${totalSolo} S)` : ''}</span>`;
            } else {
                infoDireito = `<span class="badge bg-secondary" style="font-size: 0.7rem;" title="Sem produção no mês">🚫 0 Vagas</span>`;
            }
            if (reposicoes > 0) {
                infoDireito += ` <span class="badge bg-success shadow-sm" style="font-size: 0.7rem; cursor: pointer;" title="Clique para zerar esse bônus após gerado!" onclick="event.preventDefault(); event.stopPropagation(); zerarReposicoes('${c.id}', '${c.nome}')">✨ +${reposicoes} Rep</span>`;
            }
        }

        let badgeFaltas = c.faltas > 0 ? `<span class="badge bg-danger ms-1" title="Acúmulo de Faltas">${c.faltas} ⚠️</span>` : '';

        html += `
            <div class="col-md-4">
                <div class="form-check border ${corBorda} border-2 rounded p-2 bg-white shadow-sm d-flex align-items-center h-100">
                    <input class="form-check-input ms-1 me-2 chk-corretor flex-shrink-0" type="checkbox" value="${c.id}" id="chk_${c.id}" data-nome="${c.nome}" data-cor="${dataCor}">
                    <label class="form-check-label fw-bold w-100 d-flex justify-content-between align-items-center" style="cursor: pointer;" for="chk_${c.id}">
                        <span class="text-truncate pe-1">${c.nome.split(' ')[0]}</span>
                        <span class="text-nowrap">${infoDireito}${badgeFaltas}</span>
                    </label>
                </div>
            </div>
        `;
    });

    divCheckboxes.innerHTML = html;
    new bootstrap.Modal(document.getElementById('modal-sorteio')).show();
};

window.selecionarFiltros = (tipo) => {
    const checkboxes = document.querySelectorAll('.chk-corretor');
    checkboxes.forEach(chk => {
        let cor = chk.getAttribute('data-cor');
        if (tipo === 'todos') chk.checked = true;
        else if (tipo === 'verdes' && cor === 'verde') chk.checked = true;
        else if (tipo === 'amarelos' && cor === 'amarelo') chk.checked = true;
        else if (tipo === 'limpar') chk.checked = false;
    });
};

async function getEscalaOutraLojaMesclada(outraLoja) {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    const ano = parseInt(anoStr);
    const mesIndex = parseInt(mesStr) - 1;
    const prev = new Date(ano, mesIndex - 1, 1);
    const next = new Date(ano, mesIndex + 1, 1);
    const formataMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const [snapAtual, snapPrev, snapNext] = await Promise.all([
        getDoc(doc(db, "escala_lojas", `${outraLoja}_${filtroMes.value}`)),
        getDoc(doc(db, "escala_lojas", `${outraLoja}_${formataMes(prev)}`)),
        getDoc(doc(db, "escala_lojas", `${outraLoja}_${formataMes(next)}`) )
    ]);

    let combinada = {};
    if (snapPrev.exists() && snapPrev.data().escala) Object.assign(combinada, snapPrev.data().escala);
    if (snapNext.exists() && snapNext.data().escala) Object.assign(combinada, snapNext.data().escala);
    if (snapAtual.exists() && snapAtual.data().escala) Object.assign(combinada, snapAtual.data().escala);
    return combinada;
}

window.sortearESalvar = async () => {
    const lojaAlvo = window.lojaSorteioAtual;
    const checkboxes = document.querySelectorAll('.chk-corretor:checked');
    if (checkboxes.length === 0) return mostrarAlerta("Atenção", "Selecione pelo menos um corretor para participar do sorteio!");

    const valSemana = filtroSemana.value;
    const diasDaVisao = (valSemana === "all") ? estado.semanas.flat() : (estado.semanas[parseInt(valSemana)] || []);
    let textoEscopo = (valSemana === "all") ? "o <b>MÊS COMPLETO</b>" : `a <b>SEMANA ${parseInt(valSemana) + 1}</b>`;

    let msgConfirma = `Deseja gerar o sorteio da Loja <b>${lojaAlvo.toUpperCase()}</b> para ${textoEscopo}?<br><br><small class='text-muted'>O sistema aplicará a meritocracia, pulará as semanas travadas (🔒) e evitará repetições no mesmo dia.</small>`;

    mostrarConfirmacao("🎲 Gerar Sorteio Automático", msgConfirma, async () => {
        
        let selecionados = [];
        checkboxes.forEach(c => selecionados.push({ id: c.value, nome: c.getAttribute('data-nome') }));

        const outraLoja = lojaAlvo === 'flamengo' ? 'tijuca' : 'flamengo';
        const escalaOutraLoja = await getEscalaOutraLojaMesclada(outraLoja);

        let semanaDoDia = {};
        estado.semanas.forEach((sem, index) => {
            sem.forEach(dia => { semanaDoDia[dia.iso] = index; });
        });
        
        let alocadosPorSemana = {}; 
        let corretoresMetas = {};

        selecionados.forEach(c => {
            let cData = estado.corretores.find(x => x.id === c.id);
            let isSuspenso = cData ? cData.isSuspenso : false;
            let pme = (cData && !isSuspenso) ? cData.pme : 0;
            let pf = (cData && !isSuspenso) ? cData.pf : 0;
            let reposicoes = (cData && !isSuspenso) ? cData.reposicoes : 0; 
            let pontos = (pme * 2) + pf;

            let total = pontos > 0 ? 1 + Math.floor(pontos / 5000) : 0;
            total = Math.min(4, total); 
            total += reposicoes; 

            let solo = Math.floor(pme / 5000);
            solo = Math.min(2, solo); 
            solo = Math.min(solo, total);
            let resto = pontos % 5000;

            corretoresMetas[c.id] = { 
                id: c.id, nome: c.nome, totalGeral: total, totalSolo: solo, 
                alocadosGeral: 0, alocadosSolo: 0, alocadosXepa: 0,
                pontos: pontos, resto: resto 
            };
            alocadosPorSemana[c.id] = {}; 
        });

        // 🟢 REGRA DA TRAVA DE SEGURANÇA 🟢
        let diasParaIgnorar = diasDaVisao.filter(d => {
            let travado = estado.escala[lojaAlvo][d.iso] && estado.escala[lojaAlvo][d.iso].travado;
            return !travado; 
        }).map(d => d.iso);

        for (let iso in estado.escala[lojaAlvo]) {
            let sIdx = semanaDoDia[iso];
            let diaEscala = estado.escala[lojaAlvo][iso];

            ['manha', 'tarde'].forEach(turno => {
                if(!diaEscala[turno]) return;
                let cad1 = diaEscala[turno][0];
                let cad2 = diaEscala[turno][1];
                
                if (cad1 && cad2 && cad1.id === cad2.id) { 
                    if (corretoresMetas[cad1.id] && !diasParaIgnorar.includes(iso)) {
                        corretoresMetas[cad1.id].alocadosGeral++;
                        corretoresMetas[cad1.id].alocadosSolo++;
                    }
                    if (cad1.id && sIdx !== undefined) {
                        if (!alocadosPorSemana[cad1.id]) alocadosPorSemana[cad1.id] = {};
                        alocadosPorSemana[cad1.id][sIdx] = (alocadosPorSemana[cad1.id][sIdx] || 0) + 1;
                    }
                } else {
                    if (cad1) {
                        if (corretoresMetas[cad1.id] && !diasParaIgnorar.includes(iso)) corretoresMetas[cad1.id].alocadosGeral++;
                        if (sIdx !== undefined) {
                            if (!alocadosPorSemana[cad1.id]) alocadosPorSemana[cad1.id] = {};
                            alocadosPorSemana[cad1.id][sIdx] = (alocadosPorSemana[cad1.id][sIdx] || 0) + 1;
                        }
                    }
                    if (cad2) {
                        if (corretoresMetas[cad2.id] && !diasParaIgnorar.includes(iso)) corretoresMetas[cad2.id].alocadosGeral++;
                        if (sIdx !== undefined) {
                            if (!alocadosPorSemana[cad2.id]) alocadosPorSemana[cad2.id] = {};
                            alocadosPorSemana[cad2.id][sIdx] = (alocadosPorSemana[cad2.id][sIdx] || 0) + 1;
                        }
                    }
                }
            });
        }

        let turnosParaPreencher = [];
        diasDaVisao.forEach(dia => {
            if (dia.isFeriado) return;
            
            // 🟢 PULA OS DIAS TRAVADOS 🟢
            let travado = estado.escala[lojaAlvo][dia.iso] && estado.escala[lojaAlvo][dia.iso].travado;
            if (travado) return; 

            turnosParaPreencher.push({ iso: dia.iso, turno: 'manha', vagas: [null, null] });
            turnosParaPreencher.push({ iso: dia.iso, turno: 'tarde', vagas: [null, null] });
        });
        turnosParaPreencher.sort(() => Math.random() - 0.5); 

        const isCorretorOcupadoNaOutraLoja = (corretorId, iso) => {
            if (!escalaOutraLoja[iso]) return false;
            let eOutra = escalaOutraLoja[iso];
            if (eOutra.manha && (eOutra.manha[0]?.id === corretorId || eOutra.manha[1]?.id === corretorId)) return true;
            if (eOutra.tarde && (eOutra.tarde[0]?.id === corretorId || eOutra.tarde[1]?.id === corretorId)) return true;
            return false;
        };

        const isCorretorOcupadoNoDiaNaMesmaLoja = (corretorId, iso) => {
            let turnosDoDia = turnosParaPreencher.filter(t => t.iso === iso);
            for(let t of turnosDoDia) {
                if(t.vagas[0]?.id === corretorId || t.vagas[1]?.id === corretorId) return true;
            }
            return false;
        };

        Object.values(corretoresMetas).forEach(cMeta => {
            while (cMeta.alocadosSolo < cMeta.totalSolo && cMeta.alocadosGeral < cMeta.totalGeral) {
                let turnoIndex = turnosParaPreencher.findIndex(t => 
                    t.vagas[0] === null && t.vagas[1] === null && 
                    !isCorretorOcupadoNaOutraLoja(cMeta.id, t.iso) &&
                    !isCorretorOcupadoNoDiaNaMesmaLoja(cMeta.id, t.iso) &&
                    (alocadosPorSemana[cMeta.id][semanaDoDia[t.iso]] || 0) === 0 
                );
                
                if (turnoIndex === -1) {
                    turnoIndex = turnosParaPreencher.findIndex(t => 
                        t.vagas[0] === null && t.vagas[1] === null && 
                        !isCorretorOcupadoNaOutraLoja(cMeta.id, t.iso) &&
                        !isCorretorOcupadoNoDiaNaMesmaLoja(cMeta.id, t.iso)
                    );
                }

                if (turnoIndex !== -1) {
                    let sIdx = semanaDoDia[turnosParaPreencher[turnoIndex].iso];
                    turnosParaPreencher[turnoIndex].vagas[0] = { id: cMeta.id, nome: cMeta.nome, atendimentos: 0, falta: false };
                    turnosParaPreencher[turnoIndex].vagas[1] = { id: cMeta.id, nome: cMeta.nome, atendimentos: 0, falta: false };
                    cMeta.alocadosSolo++;
                    cMeta.alocadosGeral++;
                    alocadosPorSemana[cMeta.id][sIdx] = (alocadosPorSemana[cMeta.id][sIdx] || 0) + 1;
                } else break; 
            }
        });

        turnosParaPreencher.forEach(t => {
            let sIdx = semanaDoDia[t.iso];
            for (let i = 0; i < 2; i++) {
                if (t.vagas[i] !== null) continue; 

                let elegiveis = Object.values(corretoresMetas).filter(cMeta => 
                    cMeta.alocadosGeral < cMeta.totalGeral && 
                    t.vagas[0]?.id !== cMeta.id && 
                    !isCorretorOcupadoNaOutraLoja(cMeta.id, t.iso) && 
                    !isCorretorOcupadoNoDiaNaMesmaLoja(cMeta.id, t.iso) 
                );

                if (elegiveis.length > 0) {
                    elegiveis.sort((a, b) => {
                        let vezesSemanaA = alocadosPorSemana[a.id][sIdx] || 0;
                        let vezesSemanaB = alocadosPorSemana[b.id][sIdx] || 0;
                        if (vezesSemanaA !== vezesSemanaB) return vezesSemanaA - vezesSemanaB; 

                        let percA = a.alocadosGeral / a.totalGeral;
                        let percB = b.alocadosGeral / b.totalGeral;
                        if (percA === percB) return Math.random() - 0.5; 
                        return percA - percB;
                    });

                    let escolhido = elegiveis[0];
                    t.vagas[i] = { id: escolhido.id, nome: escolhido.nome, atendimentos: 0, falta: false };
                    escolhido.alocadosGeral++;
                    alocadosPorSemana[escolhido.id][sIdx] = (alocadosPorSemana[escolhido.id][sIdx] || 0) + 1;
                }
            }
        });

        let elegiveisXepa = Object.values(corretoresMetas).filter(c => c.pontos > 0 || c.totalGeral > 0);

        turnosParaPreencher.forEach(t => {
            let sIdx = semanaDoDia[t.iso];
            for (let i = 0; i < 2; i++) {
                if (t.vagas[i] !== null) continue; 

                elegiveisXepa.sort((a, b) => {
                    let vezesSemanaA = alocadosPorSemana[a.id][sIdx] || 0;
                    let vezesSemanaB = alocadosPorSemana[b.id][sIdx] || 0;
                    if (vezesSemanaA !== vezesSemanaB) return vezesSemanaA - vezesSemanaB;

                    if (a.alocadosXepa !== b.alocadosXepa) return a.alocadosXepa - b.alocadosXepa; 
                    if (b.resto !== a.resto) return b.resto - a.resto; 
                    return b.pontos - a.pontos; 
                });

                for (let cMeta of elegiveisXepa) {
                    if (cMeta.alocadosGeral < 4 && 
                        t.vagas[0]?.id !== cMeta.id && 
                        !isCorretorOcupadoNaOutraLoja(cMeta.id, t.iso) &&
                        !isCorretorOcupadoNoDiaNaMesmaLoja(cMeta.id, t.iso)) {
                        
                        t.vagas[i] = { id: cMeta.id, nome: cMeta.nome, atendimentos: 0, falta: false };
                        cMeta.alocadosGeral++;
                        cMeta.alocadosXepa++; 
                        alocadosPorSemana[cMeta.id][sIdx] = (alocadosPorSemana[cMeta.id][sIdx] || 0) + 1;
                        break;
                    }
                }
            }
        });

        diasDaVisao.forEach(dia => {
            if (dia.isFeriado) return;
            
            // 🟢 PRESERVA OS DIAS TRAVADOS 🟢
            let travado = estado.escala[lojaAlvo][dia.iso] && estado.escala[lojaAlvo][dia.iso].travado;
            if (travado) return; 

            let turnosDoDia = turnosParaPreencher.filter(t => t.iso === dia.iso);
            let manha = turnosDoDia.find(t => t.turno === 'manha');
            let tarde = turnosDoDia.find(t => t.turno === 'tarde');

            estado.escala[lojaAlvo][dia.iso] = {
                manha: manha ? manha.vagas : [null, null],
                tarde: tarde ? tarde.vagas : [null, null],
                travado: false
            };
        });

        try {
            await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
            mostrarAlerta("Prontinho! ✅", "Escala Meritocrática gerada e salva com sucesso no banco de dados.");
            bootstrap.Modal.getInstance(document.getElementById('modal-sorteio')).hide();
            atualizarVisualizacao(); 
        } catch (error) { 
            console.error("Erro ao salvar:", error); 
            mostrarAlerta("Erro Crítico", "Ocorreu um erro de conexão ao tentar salvar no banco de dados."); 
        }
        
    }, 'btn-primary', '🎲 Sim, Sortear!'); 
};

window.zerarEscalaSemana = async (lojaAlvo) => {
    const valSemana = filtroSemana.value;
    const diasDaVisao = (valSemana === "all") ? estado.semanas.flat() : (estado.semanas[parseInt(valSemana)] || []);
    let textoEscopo = (valSemana === "all") ? "o <b>MÊS COMPLETO</b>" : `a <b>SEMANA ${parseInt(valSemana) + 1}</b>`;

    if (diasDaVisao.length === 0) return mostrarAlerta("Atenção", "Não há dias úteis visíveis para zerar.");

    let msgConfirma = `⚠️ Tem certeza que deseja <b>ZERAR</b> toda a escala para ${textoEscopo} na Loja <b>${lojaAlvo.toUpperCase()}</b>?<br><br>Semanas travadas serão preservadas.`;

    mostrarConfirmacao("Zerar Escala", msgConfirma, async () => {
        try {
            if (!estado.escala[lojaAlvo]) estado.escala[lojaAlvo] = {};

            for (let dia of diasDaVisao) {
                let iso = dia.iso;
                
                // 🟢 PULA OS DIAS TRAVADOS NA HORA DE EXCLUIR 🟢
                let travado = estado.escala[lojaAlvo][iso] && estado.escala[lojaAlvo][iso].travado;
                if (travado) continue; 

                if (estado.escala[lojaAlvo][iso]) {
                    let turnos = ['manha', 'tarde'];
                    for (let t of turnos) {
                        for (let i = 0; i < 2; i++) {
                            let c = estado.escala[lojaAlvo][iso][t] ? estado.escala[lojaAlvo][iso][t][i] : null;
                            let updates = {};
                            if (c && c.id) {
                                if (c.falta) updates.faltas = increment(-1);
                                if (c.reposicao) updates.reposicoes = increment(-1);
                                if (Object.keys(updates).length > 0) await updateDoc(doc(db, "corretores", c.id), updates);
                            }
                        }
                    }
                }
                estado.escala[lojaAlvo][iso] = { manha: [null, null], tarde: [null, null], travado: false };
            }

            await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
            mostrarAlerta("Escala Zerada 🗑️", "A escala destravada foi limpa com sucesso!");
            atualizarVisualizacao();

        } catch (error) { 
            console.error("Erro ao zerar escala:", error); 
            mostrarAlerta("Erro de Sistema", "Ops! Erro ao tentar zerar a tabela."); 
        }
    }, 'btn-danger', '🗑️ Sim, Zerar!');
};

window.abrirModalRelatorio = async (nomeLoja) => {
    document.getElementById('nome-loja-relatorio').innerText = nomeLoja;
    const registros = await buscarDadosAtendimentos(nomeLoja); 
    
    const totalMes = registros.reduce((acc, curr) => acc + (curr.qtd || 0), 0);
    document.getElementById('total-mes').innerText = totalMes;

    const valSemana = filtroSemana.value;
    let totalSemana = 0;
    if (valSemana !== "all") {
        const diasDaSemana = estado.semanas[parseInt(valSemana)].map(d => d.iso);
        totalSemana = registros.filter(r => diasDaSemana.includes(r.iso)).reduce((acc, curr) => acc + (curr.qtd || 0), 0);
    } else {
        totalSemana = totalMes;
    }
    document.getElementById('total-semana').innerText = totalSemana;

    const ranking = {};
    registros.forEach(r => {
        ranking[r.corretor] = (ranking[r.corretor] || 0) + (r.qtd || 0);
    });

    const tbody = document.getElementById('lista-corretores-atendimentos');
    tbody.innerHTML = Object.entries(ranking)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, qtd]) => `<tr><td>${nome}</td><td><span class="badge bg-dark">${qtd}</span></td></tr>`)
        .join('') || '<tr><td colspan="2" class="text-center text-muted">Nenhum atendimento registrado.</td></tr>';

    new bootstrap.Modal(document.getElementById('modal-relatorio-atendimentos')).show();
};

async function buscarDadosAtendimentos(nomeLoja) {
    const lojaId = nomeLoja.toLowerCase().includes('flamengo') ? 'flamengo' : 'tijuca';
    const escala = estado.escala[lojaId];
    const listaAtendimentos = [];

    if (!escala) return listaAtendimentos;

    for (let iso in escala) {
        if (iso.startsWith(filtroMes.value)) {
            const turnos = escala[iso];
            ['manha', 'tarde'].forEach(turno => {
                if (turnos[turno]) {
                    turnos[turno].forEach(corretor => {
                        if (corretor && corretor.atendimentos > 0) {
                            listaAtendimentos.push({
                                iso: iso,
                                corretor: corretor.nome,
                                qtd: parseInt(corretor.atendimentos) || 0
                            });
                        }
                    });
                }
            });
        }
    }
    return listaAtendimentos;
}

// ==========================================
// 8. GERENCIAMENTO DE FERIADOS
// ==========================================
function renderizarListaFeriadosModal() {
    const divLista = document.getElementById('lista-feriados-modal');
    let html = '';

    if (estado.feriados.length === 0) {
        html = '<div class="text-center text-muted py-3 small">Nenhum feriado cadastrado.</div>';
    } else {
        estado.feriados.forEach(f => {
            const [ano, mes, dia] = f.data.split('-');
            const dataFmt = `${dia}/${mes}/${ano}`;
            
            html += `
                <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                    <div>
                        <span class="fw-bold text-dark">${dataFmt}</span> - 
                        <span class="text-muted small">${f.descricao}</span>
                    </div>
                    <button class="btn btn-sm btn-outline-danger py-0 px-2 shadow-sm" onclick="excluirFeriado('${f.id}')" title="Remover Feriado">🗑️</button>
                </div>
            `;
        });
    }
    divLista.innerHTML = html;
}

window.abrirModalFeriados = () => {
    renderizarListaFeriadosModal();
    new bootstrap.Modal(document.getElementById('modal-feriados')).show();
};

window.salvarNovoFeriado = async () => {
    const inputData = document.getElementById('feriado-data').value;
    const inputDesc = document.getElementById('feriado-desc').value.trim();

    if (!inputData || !inputDesc) {
        return mostrarAlerta("Atenção", "Por favor, preencha a data e a descrição do feriado antes de salvar!");
    }

    try {
        await addDoc(collection(db, "feriados"), {
            data: inputData,
            descricao: inputDesc
        });
        
        document.getElementById('feriado-data').value = '';
        document.getElementById('feriado-desc').value = '';
    } catch (error) {
        console.error("Erro ao salvar feriado:", error);
        mostrarAlerta("Erro", "Falha de conexão ao tentar salvar o feriado.");
    }
};

window.excluirFeriado = async (id) => {
    mostrarConfirmacao("Excluir Feriado", "Deseja excluir este feriado permanentemente?<br>Os dias afetados voltarão a ter plantão normal na escala.", async () => {
        try {
            await deleteDoc(doc(db, "feriados", id));
        } catch (error) {
            console.error("Erro ao excluir feriado:", error);
            mostrarAlerta("Erro", "Não foi possível excluir o feriado.");
        }
    }, 'btn-danger', '🗑️ Sim, Excluir');
};

// ==========================================
// 9. HELPER: CALENDÁRIO FLUIDO
// ==========================================
function getSemanasFluidas(ano, mesIndex, listaDeFeriados = []) {
    let primeiroDia = new Date(ano, mesIndex, 1);
    let ultimoDia = new Date(ano, mesIndex + 1, 0);

    let start = new Date(primeiroDia);
    let diaStart = start.getDay();
    if (diaStart === 0) start.setDate(start.getDate() + 1); 
    else if (diaStart > 1) start.setDate(start.getDate() - (diaStart - 1)); 

    let end = new Date(ultimoDia);
    let diaEnd = end.getDay();
    if (diaEnd === 6) end.setDate(end.getDate() - 1); 
    else if (diaEnd === 0) end.setDate(end.getDate() - 2); 
    else if (diaEnd < 5) end.setDate(end.getDate() + (5 - diaEnd)); 

    let semanas = [];
    let semanaAtual = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];

    let current = new Date(start);
    while (current <= end) {
        let diaSemana = current.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { 
            let isoStr = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
            let feriadoEncontrado = listaDeFeriados.find(f => f.data === isoStr);
            let fmt = current.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            
            semanaAtual.push({
                iso: isoStr, fmt: fmt, diaSemana: nomesDias[diaSemana], isFeriado: !!feriadoEncontrado, descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : ""
            });

            if (diaSemana === 5) { 
                semanas.push(semanaAtual);
                semanaAtual = [];
            }
        }
        current.setDate(current.getDate() + 1);
    }
    return semanas;
}

window.iniciarLojas();
