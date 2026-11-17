// Группы ролей для разграничения доступа (ТЗ п. 4.1.2, 4.7)

// Работают с обращениями, сделками, карточками клиентов, ставят задачи и выставляют счета
export const SALES_ROLES = ['admin', 'manager', 'sales_head']
// Могут быть назначены ответственными за сделку
export const ASSIGNABLE_ROLES = ['manager', 'sales_head']
// Сотрудники агентства (все роли, кроме клиента)
export const STAFF_ROLES = ['admin', 'manager', 'sales_head', 'designer', 'marketer', 'director']
// Видят все задачи и проекты, а не только свои
export const OVERSIGHT_ROLES = ['admin', 'manager', 'sales_head', 'director']
