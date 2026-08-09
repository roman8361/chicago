export type Dealer = {
  id: string;
  fullName: string;
};

export const MOCK_DEALERS: Dealer[] = [
  { id: "dealer-ivanov-ivan", fullName: "Иванов Иван Иванович" },
  { id: "dealer-petrov-petr", fullName: "Петров Пётр Сергеевич" },
  { id: "dealer-sidorov-alexey", fullName: "Сидоров Алексей Андреевич" },
];