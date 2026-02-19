<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Plantão Lojas Físicas</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        .table-escala th, .table-escala td { vertical-align: middle; text-align: center; }
        
        .card-vaga { border: 1px dashed #ccc; padding: 10px; border-radius: 8px; background-color: #fcfcfc; height: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; position: relative; min-height: 50px;}
        .card-vaga:hover { background-color: #e9ecef; border-color: #adb5bd; }
        
        .nome-corretor { font-weight: bold; font-size: 1.1rem; color: #333; } 
        
        .manha-bg { background-color: #e0f7fa !important; }
        .tarde-bg { background-color: #fff3e0 !important; }
        
        .falta-bg { background-color: #ffe6e6 !important; border-color: #dc3545 !important; border-style: solid !important; border-width: 2px !important;}
        .falta-text { color: #dc3545 !important; text-decoration: line-through; }
    </style>
</head>
<body class="bg-light">

    <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4 shadow border-bottom border-secondary">
        <div class="container">
            <a class="navbar-brand fw-bold" href="index.html">🍋 Sistema Limão</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto align-items-center gap-3" style="font-size: 0.95rem;">
                    <li class="nav-item"><a class="nav-link text-light" href="cadastro.html">👥 Cadastro</a></li>
                    <li class="nav-item"><a class="nav-link text-light" href="parceiros.html">🤝 Parceiros</a></li>
                    <li class="nav-item"><a class="nav-link text-success fw-bold" href="producao.html">💰 Produção</a></li>
                    <li class="nav-item d-none d-lg-block text-secondary">|</li>
                    <li class="nav-item"><a class="nav-link text-warning fw-bold" href="distribuicao.html">🎲 Distribuição</a></li>
                    <li class="nav-item"><a class="nav-link text-info fw-bold" href="plantao.html">📅 Plantão (Digital)</a></li>
                    
                    <li class="nav-item"><a class="nav-link text-primary fw-bold border-bottom border-primary" href="lojas.html">🏪 Lojas</a></li>
                    
                    <li class="nav-item"><a class="nav-link text-danger fw-bold" href="leads.html">🔥 Leads</a></li>

                    <li class="nav-item dropdown">
                        <a class="nav-link position-relative" href="#" id="navbarDropdown" role="button" data-bs-toggle="dropdown">
                            <span style="font-size: 1.2rem;">🔔</span>
                            <span id="badge-contador" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none" style="font-size: 0.6rem;">0</span>
                        </a>
                        <ul class="dropdown-menu dropdown-menu-end shadow" aria-labelledby="navbarDropdown" style="width: 320px; max-height: 400px; overflow-y: auto;">
                            <li><h6 class="dropdown-header">Notificações / Lembretes</h6></li>
                            <div id="lista-notificacoes">
                                <li><span class="dropdown-item text-muted small">Nenhuma notificação nova.</span></li>
                            </div>
                        </ul>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <div class="container-fluid px-4">
        
        <div class="d-flex justify-content-between align-items-end mb-3 border-bottom pb-3">
            <div>
                <h3 class="fw-bold text-dark mb-3">🏪 Escala Presencial</h3>
                <div class="d-flex align-items-center">
                    <ul class="nav nav-pills" id="lojas-tabs">
                        <li class="nav-item me-2">
                            <a class="nav-link active fw-bold px-4" href="#" onclick="mudarLoja('flamengo', event)">📍 Loja Flamengo</a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link bg-white border text-dark fw-bold px-4" href="#" onclick="mudarLoja('tijuca', event)">📍 Loja Tijuca</a>
                        </li>
                    </ul>
                    <button class="btn btn-outline-secondary ms-3 fw-bold border-2 shadow-sm" onclick="abrirModalTroca()">
                        🔄 Troca de Plantão
                    </button>
                </div>
            </div>
            
            <div class="d-flex gap-3 align-items-center bg-white p-3 rounded shadow-sm border">
                <div>
                    <label class="small text-muted fw-bold">Mês Referência:</label>
                    <input type="month" id="filtro-mes" class="form-control fw-bold form-control-sm">
                </div>
                <div>
                    <label class="small text-muted fw-bold">Semana:</label>
                    <select id="filtro-semana" class="form-select fw-bold form-select-sm">
                        <option value="0">Semana 1</option>
                        <option value="1">Semana 2</option>
                        <option value="2">Semana 3</option>
                        <option value="3">Semana 4</option>
                        <option value="4">Semana 5</option>
                    </select>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary fw-bold shadow-sm" onclick="abrirModalSorteio()">
                        🎲 Gerar Escala (<span id="nome-loja-btn">Flamengo</span>)
                    </button>
                </div>
            </div>
        </div>

        <div class="card shadow border-dark mb-5">
            <div class="card-header bg-dark text-white fw-bold fs-5 d-flex justify-content-between align-items-center">
                <span id="titulo-tabela">📅 Escala - Loja Flamengo</span>
                <small class="fw-normal">Manhã: 09h às 13h30 | Tarde: 13h30 às 18h</small>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-bordered table-escala mb-0">
                        <thead>
                            <tr>
                                <th class="bg-light" rowspan="2" style="width: 15%;">Data</th>
                                <th colspan="2" class="manha-bg border-bottom-0">☀️ Turno da Manhã</th>
                                <th colspan="2" class="tarde-bg border-bottom-0">🌙 Turno da Tarde</th>
                            </tr>
                            <tr>
                                <th class="manha-bg text-muted small" style="width: 21%;">Cadeira 1</th>
                                <th class="manha-bg text-muted small" style="width: 21%;">Cadeira 2</th>
                                <th class="tarde-bg text-muted small" style="width: 21%;">Cadeira 1</th>
                                <th class="tarde-bg text-muted small" style="width: 21%;">Cadeira 2</th>
                            </tr>
                        </thead>
                        <tbody id="tabela-body">
                            <tr><td colspan="5" class="text-center py-5">Carregando escala...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modal-sorteio" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content border-0 shadow">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title fw-bold">Selecione os Corretores para Sortear</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body bg-light">
                    <p class="text-muted mb-3">Marque os corretores que participarão da escala presencial desta loja neste mês.</p>
                    <div class="row g-2" id="lista-checkboxes-corretores">
                        <div class="col-12 text-center text-muted py-3">Buscando equipe...</div>
                    </div>
                </div>
                <div class="modal-footer bg-white">
                    <button type="button" class="btn btn-secondary fw-bold" onclick="marcarTodos()">Marcar Todos</button>
                    <button type="button" class="btn btn-primary fw-bold px-4" onclick="sortearESalvar()">🎲 Confirmar e Sortear</button>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modal-detalhes-plantao" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-dark text-white">
                    <h5 class="modal-title fw-bold" id="modal-detalhes-titulo">Detalhes do Plantão</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body bg-light p-4">
                    
                    <div class="mb-4">
                        <label class="form-label fw-bold text-muted small text-uppercase">Substituir / Alterar Corretor:</label>
                        <select id="select-alterar-corretor" class="form-select border-secondary fw-bold shadow-sm">
                            <option value="">-- Vaga Livre --</option>
                        </select>
                    </div>

                    <div class="row g-3 align-items-center">
                        <div class="col-6 border-end">
                            <label class="form-label fw-bold text-muted small text-uppercase text-center w-100">Contador Atendimentos:</label>
                            <div class="input-group shadow-sm">
                                <button class="btn btn-secondary fw-bold px-3" type="button" onclick="mudarAtendimentos(-1)">-</button>
                                <input type="number" class="form-control text-center fw-bold fs-5" id="input-atendimentos" value="0" min="0">
                                <button class="btn btn-primary fw-bold px-3" type="button" onclick="mudarAtendimentos(1)">+</button>
                            </div>
                        </div>
                        <div class="col-6 text-center">
                            <div class="form-check form-switch fs-4 d-inline-block mt-2">
                                <input class="form-check-input shadow-sm" type="checkbox" id="check-falta" style="cursor: pointer;">
                                <label class="form-check-label fw-bold text-danger fs-6 ms-2" for="check-falta" style="cursor: pointer;">MARCAR FALTA</label>
                            </div>
                        </div>
                    </div>
                    
                    <div id="info-troca-container" class="mt-4 text-center d-none">
                        <span class="badge bg-warning text-dark border border-warning shadow-sm p-2 w-100 fs-6" id="texto-info-troca" style="white-space: normal;"></span>
                    </div>

                </div>
                <div class="modal-footer bg-white">
                    <button type="button" class="btn btn-outline-secondary fw-bold" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-success fw-bold px-4 shadow-sm" onclick="salvarDetalhesPlantao()">💾 Salvar Alterações</button>
                </div>
            </div>
        </div>
    </div>

    <div class="modal fade" id="modal-troca" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content shadow-lg border-0">
                <div class="modal-header bg-warning text-dark">
                    <h5 class="modal-title fw-bold">🔄 Trocar Plantões (Mesma Loja)</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body bg-light p-4">
                    <p class="text-muted small mb-4">Selecione os dois plantões que deseja inverter a posição.</p>

                    <h6 class="fw-bold text-primary">Plantão 1 (Origem)</h6>
                    <div class="row g-2 mb-3">
                        <div class="col-5">
                            <select id="troca-data-1" class="form-select form-select-sm shadow-sm border-primary"></select>
                        </div>
                        <div class="col-4">
                            <select id="troca-turno-1" class="form-select form-select-sm shadow-sm border-primary">
                                <option value="manha">Manhã</option>
                                <option value="tarde">Tarde</option>
                            </select>
                        </div>
                        <div class="col-3">
                            <select id="troca-cadeira-1" class="form-select form-select-sm shadow-sm border-primary">
                                <option value="0">Cad. 1</option>
                                <option value="1">Cad. 2</option>
                            </select>
                        </div>
                    </div>

                    <h6 class="fw-bold text-info mt-4">Plantão 2 (Destino)</h6>
                    <div class="row g-2 mb-3">
                        <div class="col-5">
                            <select id="troca-data-2" class="form-select form-select-sm shadow-sm border-info"></select>
                        </div>
                        <div class="col-4">
                            <select id="troca-turno-2" class="form-select form-select-sm shadow-sm border-info">
                                <option value="manha">Manhã</option>
                                <option value="tarde">Tarde</option>
                            </select>
                        </div>
                        <div class="col-3">
                            <select id="troca-cadeira-2" class="form-select form-select-sm shadow-sm border-info">
                                <option value="0">Cad. 1</option>
                                <option value="1">Cad. 2</option>
                            </select>
                        </div>
                    </div>

                </div>
                <div class="modal-footer bg-white">
                    <button type="button" class="btn btn-outline-secondary fw-bold" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-warning fw-bold px-4 shadow-sm" onclick="efetuarTroca()">🔄 Confirmar Troca</button>
                </div>
            </div>
        </div>
    </div>

    <script type="module" src="app-lojas.js"></script>
    <script type="module" src="app-notificacoes.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
