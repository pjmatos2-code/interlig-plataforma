-- 0072: perfil "gestor_tecnico" — enxerga somente o módulo Equipe Técnica.
alter type perfil_usuario add value if not exists 'gestor_tecnico';
