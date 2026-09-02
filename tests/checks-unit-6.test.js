import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { validateChecks } from '../scripts/validate-checks.js';
import {
  score, specFor, havePython, setup, errorsForUnit,
} from './helpers/check-runner.js';

/* Unit 6 is the unit that could not be graded honestly before the analyzer
   learned about classes.
 *
 * Every other unit's wrong answers announce themselves by behaving wrongly.
 * This one has a wrong answer that behaves perfectly: a Student that copies
 * Person's methods into its own body runs identically to a Student that
 * inherits them, and no stdout, no return value and no property of the output
 * separates the two. Only the class statement does. So the inheritance lessons
 * assert `bases` on the tree, and the last describe in this file is the proof
 * that the assertion bites.
 *
 * Everything else mirrors Unit 1: a reference solution that must pass every
 * case and a plausible wrong one that must not, run against real CPython
 * through the same harness the browser uses. The "rejects" half is what makes
 * the "accepts" half mean anything.
 */

beforeAll(() => {
  setup();
});

/* Python written as lines rather than as one string with \n escapes. Almost
   every solution here contains an f-string, and `${self.name}` inside a
   JavaScript template literal is an interpolation, so the readable syntax is
   the one that would silently rewrite the fixtures. */
function py(...lines) {
  return `${lines.join('\n')}\n`;
}

/* A correct solution and a plausible wrong one for every Unit 6 exercise. The
   wrong answers are the mistakes this unit actually produces: self left off a
   method, the instance attribute written in the class body so every object
   shares it, __init__ overridden without calling super(), the class variable
   incremented through self, the overriding method written at the left margin,
   the setter with no rule in it, and the copied methods that are not
   inheritance. */
const FIXTURES = [
  ['introduction-oop-concepts', 'exercise1',
    py(
      '# A class is a blueprint: it describes what things of this kind have and do',
      '# An object is one instance built from that blueprint, with its own values',
      'print("A class is like a blueprint and an object is like a house built from it")',
    ),
    // The explanation is printed, but nothing is explained to the reader of
    // the code, which is half of what the exercise asked for.
    py('print("A class is like a blueprint and an object is like a house built from it")')],

  ['introduction-oop-concepts', 'exercise2',
    py(
      'dog_name = "Buddy"',
      'dog_breed = "Golden Retriever"',
      'dog_age = 3',
      '',
      'def bark():',
      '    return "Woof! Woof!"',
      '',
      'print(f"Dog: {dog_name}, {dog_breed}, {dog_age} years old")',
      'print(bark())',
    ),
    // The behaviour is printed rather than performed: there is no bark to call.
    py(
      'dog_name = "Buddy"',
      'dog_breed = "Golden Retriever"',
      'dog_age = 3',
      '',
      'print(f"Dog: {dog_name}, {dog_breed}, {dog_age} years old")',
      'print("Woof! Woof!")',
    )],

  ['defining-creating-classes', 'exercise1',
    py(
      'class Dog:',
      '    def __init__(self, name, breed):',
      '        self.name = name',
      '        self.breed = breed',
      '',
      'dog1 = Dog("Buddy", "Golden Retriever")',
      'print(f"Dog: {dog1.name}, Breed: {dog1.breed}")',
    ),
    // The details are written into the class body, so __init__ can throw its
    // parameters away and the one dog the exercise names still looks right.
    py(
      'class Dog:',
      '    name = "Buddy"',
      '    breed = "Golden Retriever"',
      '',
      '    def __init__(self, name, breed):',
      '        pass',
      '',
      'dog1 = Dog("Buddy", "Golden Retriever")',
      'print(f"Dog: {dog1.name}, Breed: {dog1.breed}")',
    )],

  ['defining-creating-classes', 'exercise2',
    py(
      'class Circle:',
      '    def __init__(self, radius):',
      '        self.radius = radius',
      '        self.color = "Red"',
      '',
      'circle1 = Circle(5)',
      'print(f"Radius: {circle1.radius}, Color: {circle1.color}")',
    ),
    // self left off the parameter list, which is the first mistake everyone
    // makes and the reason the error message is so confusing.
    py(
      'class Circle:',
      '    def __init__(radius):',
      '        self.radius = radius',
      '        self.color = "Red"',
      '',
      'circle1 = Circle(5)',
      'print(f"Radius: {circle1.radius}, Color: {circle1.color}")',
    )],

  ['creating-using-objects', 'exercise1',
    py(
      'class Person:',
      '    def __init__(self, name, age):',
      '        self.name = name',
      '        self.age = age',
      '',
      'person1 = Person("Alice", 25)',
      'person2 = Person("Bob", 30)',
      'print(f"{person1.name} is {person1.age} years old")',
      'print(f"{person2.name} is {person2.age} years old")',
    ),
    // One object where the exercise asked for two.
    py(
      'class Person:',
      '    def __init__(self, name, age):',
      '        self.name = name',
      '        self.age = age',
      '',
      'person1 = Person("Alice", 25)',
      'print(f"{person1.name} is {person1.age} years old")',
    )],

  ['creating-using-objects', 'exercise2',
    py(
      'class Counter:',
      '    def __init__(self):',
      '        self.count = 0',
      '',
      'counter1 = Counter()',
      'print(f"Initial count: {counter1.count}")',
      '',
      'counter1.count = 5',
      'print(f"Updated count: {counter1.count}")',
    ),
    // The 5 moved into __init__, so every counter is born at five and nothing
    // was ever modified.
    py(
      'class Counter:',
      '    def __init__(self):',
      '        self.count = 5',
      '',
      'counter1 = Counter()',
      'print(f"Count: {counter1.count}")',
    )],

  ['instance-variables-methods', 'exercise1',
    py(
      'class Book:',
      '    def __init__(self, title, author):',
      '        self.title = title',
      '        self.author = author',
      '',
      'book = Book("Python Guide", "Jane Smith")',
      'print(f"Title: {book.title}")',
      'print(f"Author: {book.author}")',
    ),
    // Class-body attributes: every book ever made is this book.
    py(
      'class Book:',
      '    title = "Python Guide"',
      '    author = "Jane Smith"',
      '',
      '    def __init__(self, title, author):',
      '        pass',
      '',
      'book = Book("Python Guide", "Jane Smith")',
      'print(f"Title: {book.title}")',
      'print(f"Author: {book.author}")',
    )],

  ['instance-variables-methods', 'exercise2',
    py(
      'class BankAccount:',
      '    def __init__(self):',
      '        self.balance = 0',
      '',
      '    def deposit(self, amount):',
      '        self.balance += amount',
      '',
      '    def get_balance(self):',
      '        return self.balance',
      '',
      'account = BankAccount()',
      'account.deposit(100)',
      'print(f"Balance: {account.get_balance()}")',
    ),
    // deposit replaces instead of adding, which one deposit cannot reveal.
    py(
      'class BankAccount:',
      '    def __init__(self):',
      '        self.balance = 0',
      '',
      '    def deposit(self, amount):',
      '        self.balance = amount',
      '',
      '    def get_balance(self):',
      '        return self.balance',
      '',
      'account = BankAccount()',
      'account.deposit(100)',
      'print(f"Balance: {account.get_balance()}")',
    )],

  ['class-variables-class-methods', 'exercise1',
    py(
      'class Car:',
      '    wheels = 4',
      '',
      '    def __init__(self, brand):',
      '        self.brand = brand',
      '',
      'car1 = Car("Toyota")',
      'car2 = Car("Honda")',
      'print(f"{car1.brand} has {car1.wheels} wheels")',
      'print(f"{car2.brand} has {car2.wheels} wheels")',
    ),
    // wheels set on self, so each car carries its own copy and the class has
    // none. Reading Car.wheels is what tells the two apart.
    py(
      'class Car:',
      '    def __init__(self, brand):',
      '        self.brand = brand',
      '        self.wheels = 4',
      '',
      'car1 = Car("Toyota")',
      'car2 = Car("Honda")',
      'print(f"{car1.brand} has {car1.wheels} wheels")',
      'print(f"{car2.brand} has {car2.wheels} wheels")',
    )],

  ['class-variables-class-methods', 'exercise2',
    py(
      'class Counter:',
      '    count = 0',
      '',
      '    def __init__(self):',
      '        Counter.count += 1',
      '',
      '    @classmethod',
      '    def get_count(cls):',
      '        return cls.count',
      '',
      'c1 = Counter()',
      'c2 = Counter()',
      'c3 = Counter()',
      'print(f"Total count: {Counter.get_count()}")',
    ),
    // self.count += 1 reads the class value and writes an instance attribute
    // over it, so the shared tally never moves off zero.
    py(
      'class Counter:',
      '    count = 0',
      '',
      '    def __init__(self):',
      '        self.count += 1',
      '',
      '    @classmethod',
      '    def get_count(cls):',
      '        return cls.count',
      '',
      'c1 = Counter()',
      'c2 = Counter()',
      'c3 = Counter()',
      'print(f"Total count: {Counter.get_count()}")',
    )],

  ['encapsulation-access-control', 'exercise1',
    py(
      'class BankAccount:',
      '    def __init__(self):',
      '        self._balance = 0',
      '',
      '    def get_balance(self):',
      '        return self._balance',
      '',
      '    def deposit(self, amount):',
      '        self._balance += amount',
      '',
      'account = BankAccount()',
      'account.deposit(100)',
      'print(f"Balance: {account.get_balance()}")',
    ),
    // The methods are there but the attribute is public, so the convention
    // that makes them worth having was never applied.
    py(
      'class BankAccount:',
      '    def __init__(self):',
      '        self.balance = 0',
      '',
      '    def get_balance(self):',
      '        return self.balance',
      '',
      '    def deposit(self, amount):',
      '        self.balance += amount',
      '',
      'account = BankAccount()',
      'account.deposit(100)',
      'print(f"Balance: {account.get_balance()}")',
    )],

  ['encapsulation-access-control', 'exercise2',
    py(
      'class Person:',
      '    def __init__(self):',
      '        self.__age = 0',
      '',
      '    def get_age(self):',
      '        return self.__age',
      '',
      '    def set_age(self, age):',
      '        if 0 <= age <= 150:',
      '            self.__age = age',
      '',
      'person = Person()',
      'person.set_age(25)',
      'print(f"Age: {person.get_age()}")',
    ),
    // A setter with no rule in it is a longer way of assigning the attribute.
    py(
      'class Person:',
      '    def __init__(self):',
      '        self.__age = 0',
      '',
      '    def get_age(self):',
      '        return self.__age',
      '',
      '    def set_age(self, age):',
      '        self.__age = age',
      '',
      'person = Person()',
      'person.set_age(25)',
      'print(f"Age: {person.get_age()}")',
    )],

  ['inheritance-subclasses', 'exercise1',
    py(
      'class Person:',
      '    def __init__(self, name):',
      '        self.name = name',
      '',
      '    def introduce(self):',
      '        return f"Hi, I\'m {self.name}"',
      '',
      'class Student(Person):',
      '    pass',
      '',
      'student = Student("Alice")',
      'print(student.introduce())',
    ),
    // The impostor. Identical behaviour, and not inheritance.
    py(
      'class Person:',
      '    def __init__(self, name):',
      '        self.name = name',
      '',
      '    def introduce(self):',
      '        return f"Hi, I\'m {self.name}"',
      '',
      'class Student:',
      '    def __init__(self, name):',
      '        self.name = name',
      '',
      '    def introduce(self):',
      '        return f"Hi, I\'m {self.name}"',
      '',
      'student = Student("Alice")',
      'print(student.introduce())',
    )],

  ['inheritance-subclasses', 'exercise2',
    py(
      'class Animal:',
      '    def make_sound(self):',
      '        return "Some sound"',
      '',
      'class Dog(Animal):',
      '    def make_sound(self):',
      '        return "Woof!"',
      '',
      'dog = Dog()',
      'print(dog.make_sound())',
    ),
    // Inherited but never overridden, so the dog says what the animal says.
    py(
      'class Animal:',
      '    def make_sound(self):',
      '        return "Some sound"',
      '',
      'class Dog(Animal):',
      '    pass',
      '',
      'dog = Dog()',
      'print(dog.make_sound())',
    )],

  ['polymorphism-method-overriding', 'exercise1',
    py(
      'class Shape:',
      '    def draw(self):',
      '        return "Drawing shape"',
      '',
      'class Circle(Shape):',
      '    def draw(self):',
      '        return "Drawing circle"',
      '',
      'circle = Circle()',
      'print(circle.draw())',
    ),
    // The override written at the left margin. It prints the right words and
    // Circle().draw() still finds the parent's method.
    py(
      'class Shape:',
      '    def draw(self):',
      '        return "Drawing shape"',
      '',
      'class Circle(Shape):',
      '    pass',
      '',
      'def draw():',
      '    return "Drawing circle"',
      '',
      'circle = Circle()',
      'print(draw())',
    )],

  ['polymorphism-method-overriding', 'exercise2',
    py(
      'class Payment:',
      '    def process(self):',
      '        return "Processing payment"',
      '',
      'class CreditCard(Payment):',
      '    def process(self):',
      '        return "Processing credit card"',
      '',
      'class PayPal(Payment):',
      '    def process(self):',
      '        return "Processing PayPal"',
      '',
      'payments = [CreditCard(), PayPal()]',
      'for payment in payments:',
      '    print(payment.process())',
    ),
    // Inheriting is not overriding: PayPal reports itself as a generic
    // payment, so the loop prints the same line twice.
    py(
      'class Payment:',
      '    def process(self):',
      '        return "Processing payment"',
      '',
      'class CreditCard(Payment):',
      '    def process(self):',
      '        return "Processing credit card"',
      '',
      'class PayPal(Payment):',
      '    pass',
      '',
      'payments = [CreditCard(), PayPal()]',
      'for payment in payments:',
      '    print(payment.process())',
    )],

  ['super-function', 'exercise1',
    py(
      'class Animal:',
      '    def __init__(self, name):',
      '        self.name = name',
      '',
      '    def make_sound(self):',
      '        print(f"{self.name} makes a sound")',
      '',
      'class Cat(Animal):',
      '    def __init__(self, name, color):',
      '        super().__init__(name)',
      '        self.color = color',
      '',
      '    def make_sound(self):',
      '        super().make_sound()',
      '        print("Meow")',
      '',
      'cat = Cat("Whiskers", "orange")',
      'cat.make_sound()',
      'print(f"Color: {cat.color}")',
    ),
    // __init__ overridden without calling super(), so name is never set at
    // all and the parent's sound never happens.
    py(
      'class Animal:',
      '    def __init__(self, name):',
      '        self.name = name',
      '',
      '    def make_sound(self):',
      '        print(f"{self.name} makes a sound")',
      '',
      'class Cat(Animal):',
      '    def __init__(self, name, color):',
      '        self.color = color',
      '',
      '    def make_sound(self):',
      '        print("Meow")',
      '',
      'cat = Cat("Whiskers", "orange")',
      'cat.make_sound()',
      'print(f"Color: {cat.color}")',
    )],

  ['super-function', 'exercise2',
    py(
      'class Employee:',
      '    def __init__(self, name, position):',
      '        self.name = name',
      '        self.position = position',
      '',
      '    def get_info(self):',
      '        return f"{self.name} - {self.position}"',
      '',
      'class Manager(Employee):',
      '    def __init__(self, name, position, team_size):',
      '        super().__init__(name, position)',
      '        self.team_size = team_size',
      '',
      '    def get_info(self):',
      '        return f"{super().get_info()} (Team size: {self.team_size})"',
      '',
      'manager = Manager("Sarah", "Project Manager", 5)',
      'print(manager.get_info())',
    ),
    // super() used for __init__ but not for get_info, so the override throws
    // the parent's answer away instead of building on it.
    py(
      'class Employee:',
      '    def __init__(self, name, position):',
      '        self.name = name',
      '        self.position = position',
      '',
      '    def get_info(self):',
      '        return f"{self.name} - {self.position}"',
      '',
      'class Manager(Employee):',
      '    def __init__(self, name, position, team_size):',
      '        super().__init__(name, position)',
      '        self.team_size = team_size',
      '',
      '    def get_info(self):',
      '        return f"Team size: {self.team_size}"',
      '',
      'manager = Manager("Sarah", "Project Manager", 5)',
      'print(manager.get_info())',
    )],

  ['oop-real-projects', 'exercise1',
    py(
      'class Book:',
      '    def __init__(self, title, author, isbn):',
      '        self.title = title',
      '        self.author = author',
      '        self.isbn = isbn',
      '',
      '    def __str__(self):',
      '        return f"{self.title} by {self.author}"',
      '',
      'class Library:',
      '    def __init__(self):',
      '        self.__books = []',
      '',
      '    def add_book(self, book):',
      '        self.__books.append(book)',
      '        return f"Added {book.title}"',
      '',
      '    def remove_book(self, isbn):',
      '        for i, book in enumerate(self.__books):',
      '            if book.isbn == isbn:',
      '                return f"Removed {self.__books.pop(i).title}"',
      '        return "Book not found"',
      '',
      '    def find_book(self, title):',
      '        for book in self.__books:',
      '            if book.title.lower() == title.lower():',
      '                return book',
      '        return None',
      '',
      '    def list_books(self):',
      '        return "\\n".join(str(b) for b in self.__books) or "Library is empty"',
      '',
      'library = Library()',
      'library.add_book(Book("Python Basics", "John Doe", "123456"))',
      'print(library.list_books())',
    ),
    // Every operation is there, but the collection itself is public, so the
    // methods are a suggestion rather than the only door.
    py(
      'class Book:',
      '    def __init__(self, title, author, isbn):',
      '        self.title = title',
      '        self.author = author',
      '        self.isbn = isbn',
      '',
      'class Library:',
      '    def __init__(self):',
      '        self.books = []',
      '',
      '    def add_book(self, book):',
      '        self.books.append(book)',
      '',
      '    def remove_book(self, isbn):',
      '        for i, book in enumerate(self.books):',
      '            if book.isbn == isbn:',
      '                return self.books.pop(i)',
      '        return None',
      '',
      '    def find_book(self, title):',
      '        for book in self.books:',
      '            if book.title.lower() == title.lower():',
      '                return book',
      '        return None',
      '',
      '    def list_books(self):',
      '        return self.books',
      '',
      'library = Library()',
      'library.add_book(Book("Python Basics", "John Doe", "123456"))',
      'print(library.list_books())',
    )],

  ['oop-real-projects', 'exercise2',
    py(
      'import math',
      '',
      'class Shape:',
      '    def area(self):',
      '        return 0',
      '',
      'class Rectangle(Shape):',
      '    def __init__(self, width, height):',
      '        self.width = width',
      '        self.height = height',
      '',
      '    def area(self):',
      '        return self.width * self.height',
      '',
      'class Circle(Shape):',
      '    def __init__(self, radius):',
      '        self.radius = radius',
      '',
      '    def area(self):',
      '        return math.pi * self.radius ** 2',
      '',
      'shapes = [Rectangle(5, 3), Circle(4), Rectangle(2, 8), Circle(2)]',
      'print(f"Total area: {sum(s.area() for s in shapes):.2f}")',
    ),
    // The hierarchy is right and the arithmetic is not: a rectangle's area is
    // not its width plus its height.
    py(
      'import math',
      '',
      'class Shape:',
      '    def area(self):',
      '        return 0',
      '',
      'class Rectangle(Shape):',
      '    def __init__(self, width, height):',
      '        self.width = width',
      '        self.height = height',
      '',
      '    def area(self):',
      '        return self.width + self.height',
      '',
      'class Circle(Shape):',
      '    def __init__(self, radius):',
      '        self.radius = radius',
      '',
      '    def area(self):',
      '        return math.pi * self.radius ** 2',
      '',
      'shapes = [Rectangle(5, 3), Circle(4), Rectangle(2, 8), Circle(2)]',
      'print(f"Total area: {sum(s.area() for s in shapes):.2f}")',
    )],
];

describe('the Unit 6 check files are valid', () => {
  it('names only exercises that exist on the page', () => {
    expect(errorsForUnit(validateChecks().errors, 6)).toEqual([]);
  });

  it('covers every Unit 6 lesson that has exercises', () => {
    const manifest = JSON.parse(fs.readFileSync('assets/data/curriculum.json', 'utf8'));
    const withExercises = manifest.lessons
      .filter((l) => l.unit === 6 && l.exercises.length)
      .map((l) => l.slug);
    const authored = fs
      .readdirSync('assets/data/checks/unit-6')
      .map((n) => n.replace(/\.json$/, ''));
    expect(withExercises.filter((s) => !authored.includes(s))).toEqual([]);
  });

  it('gives every exercise a hint', () => {
    for (const [slug, id] of FIXTURES) {
      expect(specFor(6, slug, id).hint, `${slug}/${id}`).toBeTruthy();
    }
  });

  /* The three lessons whose whole subject is inheritance. A behavioural check
     cannot tell inheritance from copying, so if one of these ever loses its
     `bases` requirement it grades nothing, and it would do so quietly. */
  it('asserts bases on every inheritance lesson', () => {
    const lessons = ['inheritance-subclasses', 'super-function',
      'polymorphism-method-overriding'];
    for (const slug of lessons) {
      for (const id of ['exercise1', 'exercise2']) {
        const spec = specFor(6, slug, id);
        const all = [...(spec.cases || []), ...(spec.hiddenCases || [])];
        const withBases = all.filter((c) => (((c.requires || {}).classes) || [])
          .some((k) => Array.isArray(k.bases) && k.bases.length));
        expect(withBases.length, `${slug}/${id} never asks what the class extends`)
          .toBeGreaterThan(0);
      }
    }
  });
});

describe.skipIf(!havePython)('every Unit 6 check, run against real Python', () => {
  for (const [slug, exerciseId, correct, wrong] of FIXTURES) {
    it(`${slug} / ${exerciseId}: accepts a correct solution`, () => {
      const s = score(specFor(6, slug, exerciseId), correct);
      expect(s.failed, `failed: ${s.failed.join(', ')}`).toEqual([]);
      expect(s.passed).toBe(s.total);
    });

    it(`${slug} / ${exerciseId}: rejects a plausible wrong answer`, () => {
      const s = score(specFor(6, slug, exerciseId), wrong);
      expect(s.passed, 'a check that cannot fail verifies nothing').toBeLessThan(s.total);
    });
  }
}, 300000);

/* ------------------------------------------------- the copied-methods cheat */

/* The wrong answer this unit's machinery was built for, on its own, because it
   is the one that no amount of running the code can catch.
 *
 * Both programs below print the same line. Both define a Student with a
 * working introduce. One inherits and one copies, and the difference is only
 * visible in the class statement. */
describe.skipIf(!havePython)('the inheritance check against the copied-methods impostor', () => {
  const PERSON = [
    'class Person:',
    '    def __init__(self, name):',
    '        self.name = name',
    '',
    '    def introduce(self):',
    '        return f"Hi, I\'m {self.name}"',
    '',
  ];
  const HONEST = py(...PERSON, 'class Student(Person):', '    pass', '',
    'student = Student("Alice")', 'print(student.introduce())');
  const COPIED = py(...PERSON, 'class Student:', '    def __init__(self, name):',
    '        self.name = name', '',
    '    def introduce(self):', '        return f"Hi, I\'m {self.name}"', '',
    'student = Student("Alice")', 'print(student.introduce())');

  const SPEC = () => specFor(6, 'inheritance-subclasses', 'exercise1');

  it('accepts the student who inherited', () => {
    const s = score(SPEC(), HONEST);
    expect(s.failed, s.failed.join(', ')).toEqual([]);
  });

  /* The proof that the behavioural half really cannot see it: every case that
     runs the code passes for the copy, and the tree case is the one that
     does not. */
  it('refuses the student who copied, naming the class statement', () => {
    const s = score(SPEC(), COPIED);
    expect(s.failed).toContain('Student is built from Person');
  });

  it('the copy still behaves correctly, which is why the check must read the tree', () => {
    const spec = SPEC();
    const behavioural = {
      ...spec,
      cases: (spec.cases || []).filter((c) => c.kind !== 'ast'),
      hiddenCases: (spec.hiddenCases || [])
        .filter((c) => c.kind !== 'ast' && !String(c.call || '').includes('isinstance')),
    };
    const s = score(behavioural, COPIED);
    expect(s.failed, 'stdout and return values cannot tell copying from inheriting')
      .toEqual([]);
  });
});
